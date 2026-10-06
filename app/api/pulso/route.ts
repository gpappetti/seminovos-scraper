export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { MODELO_UNIF } from '@/lib/sql-helpers';

export async function GET() {
  try {
    // Get latest date
    const [{ max_date }] = await query('SELECT MAX(data_referencia) as max_date FROM veiculos');
    if (!max_date) return NextResponse.json({ error: 'Sem dados' }, { status: 404 });

    // Pulse metrics per fornecedora
    const rows = await query(`
      SELECT
        fornecedora,
        COUNT(*) as total,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY preco_num) as mediana_preco,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY odometro_num) as mediana_km,
        ROUND(AVG(preco_num)::numeric, 0) as media_preco,
        ROUND(AVG(odometro_num)::numeric, 0) as media_km
      FROM veiculos
      WHERE data_referencia = $1
        AND preco_num IS NOT NULL
        AND odometro_num IS NOT NULL
      GROUP BY fornecedora
      ORDER BY fornecedora
    `, [max_date]);

    // Indicators: last month vs avg of previous 3 months
    const indicadores = await query(`
      WITH datas AS (
        SELECT DISTINCT data_referencia FROM veiculos ORDER BY data_referencia DESC
      ),
      ultima AS (
        SELECT data_referencia FROM datas LIMIT 1
      ),
      anteriores AS (
        SELECT data_referencia FROM datas OFFSET 1 LIMIT 90
      )
      SELECT
        v.fornecedora,
        CASE WHEN v.data_referencia = (SELECT data_referencia FROM ultima)
          THEN 'atual' ELSE 'anterior' END as periodo,
        ROUND(AVG(v.preco_num)::numeric, 0) as media_preco,
        ROUND(AVG(v.odometro_num)::numeric, 0) as media_km,
        COUNT(*) as total
      FROM veiculos v
      WHERE v.data_referencia IN (
        SELECT data_referencia FROM ultima
        UNION ALL
        SELECT data_referencia FROM anteriores
      )
        AND v.preco_num IS NOT NULL
        AND v.odometro_num IS NOT NULL
      GROUP BY v.fornecedora, periodo
      ORDER BY v.fornecedora, periodo
    `);

    // Champions: top 10 models by volume for each fornecedora
    // Usa MODELO_UNIF para normalizar ONIX/ONIX PLUS entre fornecedoras
    const campeoes = await query(`
      SELECT
        fornecedora,
        marca_norm as marca,
        ${MODELO_UNIF} as modelo,
        COUNT(*) as qtd,
        ROUND(AVG(preco_num)::numeric, 0) as preco_medio,
        ROUND(AVG(odometro_num)::numeric, 0) as km_medio
      FROM veiculos
      WHERE data_referencia = $1
        AND preco_num IS NOT NULL
      GROUP BY fornecedora, marca_norm, ${MODELO_UNIF}
      ORDER BY fornecedora, qtd DESC
    `, [max_date]);

    // Top 10 per fornecedora
    const campeoes_localiza = (campeoes ?? []).filter((r: any) => r?.fornecedora === 'LOCALIZA').slice(0, 10);
    const campeoes_movida = (campeoes ?? []).filter((r: any) => r?.fornecedora === 'MOVIDA').slice(0, 10);

    return NextResponse.json({
      data_referencia: max_date,
      pulso: rows ?? [],
      indicadores: indicadores ?? [],
      campeoes: {
        LOCALIZA: campeoes_localiza,
        MOVIDA: campeoes_movida,
      },
    });
  } catch (err: any) {
    console.error('API /pulso error:', err);
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
