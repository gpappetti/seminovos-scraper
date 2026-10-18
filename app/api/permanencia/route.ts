export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { MODELO_UNIF } from '@/lib/sql-helpers';

/* ─────────────────────────────────────────────────────────────────────────────
   Tempo médio de permanência à venda

   Para cada veículo (fingerprint fornecedora + marca_norm + modelo_unif +
   ano_modelo_raw + odometro, igual ao usado em /api/vendidos), calculamos
   primeira_data = MIN(data_referencia) e ultima_data = MAX(data_referencia).
   A permanência é a diferença em dias entre essas duas datas.

   Só entram no cálculo veículos "encerrados": aqueles cuja última aparição
   ficou pelo menos MARGEM_DIAS atrás da última coleta disponível. Isso evita
   contar como "saiu do estoque" um veículo que ainda está anunciado (ou que
   sumiu por um simples buraco de coleta) — mesma lógica de segurança usada no
   notebook de estimativa de vendas (commit 553de5e).

   Agregações:
   - por modelo (e fornecedora): média simples de permanência dos veículos
     encerrados daquele modelo.
   - por fornecedora (consolidado): média PONDERADA pela quantidade de
     veículos de cada modelo — equivalente a tirar a média da permanência de
     todos os veículos encerrados daquela fornecedora, sem média de médias.
   ───────────────────────────────────────────────────────────────────────────── */

const MARGEM_DIAS = 4; // mesma margem de segurança usada na análise de vendas

export async function GET() {
  try {
    const [{ max_date }] = await query('SELECT MAX(data_referencia) as max_date FROM veiculos');
    if (!max_date) {
      return NextResponse.json({ error: 'Dados insuficientes' }, { status: 400 });
    }

    // Vida de cada veículo (fingerprint) e se já "encerrou" (saiu do estoque)
    const encerradosBase = `
      WITH veiculo_vida AS (
        SELECT
          fornecedora,
          ${MODELO_UNIF} as modelo,
          MIN(data_referencia) as primeira_data,
          MAX(data_referencia) as ultima_data
        FROM veiculos
        GROUP BY fornecedora, marca_norm, ${MODELO_UNIF}, ano_modelo_raw, odometro
      )
      SELECT
        fornecedora,
        modelo,
        (ultima_data - primeira_data) as permanencia_dias
      FROM veiculo_vida
      WHERE ultima_data <= $1::date - $2::int
    `;

    // Por modelo (e fornecedora)
    const porModelo = await query(`
      WITH encerrados AS (${encerradosBase})
      SELECT
        fornecedora,
        modelo,
        COUNT(*) as qtd_veiculos,
        ROUND(AVG(permanencia_dias)::numeric, 1) as permanencia_media_dias
      FROM encerrados
      GROUP BY fornecedora, modelo
      HAVING COUNT(*) >= 3
      ORDER BY fornecedora, permanencia_media_dias DESC
    `, [max_date, MARGEM_DIAS]);

    // Consolidado por fornecedora (média ponderada = média sobre todos os veículos)
    const porFornecedora = await query(`
      WITH encerrados AS (${encerradosBase})
      SELECT
        fornecedora,
        COUNT(*) as qtd_veiculos,
        ROUND(AVG(permanencia_dias)::numeric, 1) as permanencia_media_dias,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY permanencia_dias)::numeric, 1) as permanencia_mediana_dias
      FROM encerrados
      GROUP BY fornecedora
    `, [max_date, MARGEM_DIAS]);

    return NextResponse.json({
      data_referencia: max_date,
      margem_dias: MARGEM_DIAS,
      por_fornecedora: porFornecedora ?? [],
      por_modelo: porModelo ?? [],
    });
  } catch (err: any) {
    console.error('API /permanencia error:', err);
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
