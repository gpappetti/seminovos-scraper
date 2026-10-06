export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { MODELO_UNIF } from '@/lib/sql-helpers';

export async function GET() {
  try {
    const [{ max_date }] = await query('SELECT MAX(data_referencia) as max_date FROM veiculos');

    // By brand
    const por_marca = await query(`
      SELECT
        fornecedora,
        marca_norm as marca,
        COUNT(*) as qtd,
        ROUND(AVG(preco_num)::numeric, 0) as preco_medio
      FROM veiculos
      WHERE data_referencia = $1 AND preco_num IS NOT NULL
      GROUP BY fornecedora, marca_norm
      ORDER BY fornecedora, qtd DESC
    `, [max_date]);

    // By model (top 15 each) — normaliza ONIX/ONIX PLUS
    const por_modelo = await query(`
      SELECT
        fornecedora,
        ${MODELO_UNIF} as modelo,
        COUNT(*) as qtd,
        ROUND(AVG(preco_num)::numeric, 0) as preco_medio
      FROM veiculos
      WHERE data_referencia = $1 AND preco_num IS NOT NULL
      GROUP BY fornecedora, ${MODELO_UNIF}
      ORDER BY fornecedora, qtd DESC
    `, [max_date]);

    // By km range
    const por_km = await query(`
      SELECT
        fornecedora,
        CASE
          WHEN odometro_num < 10000 THEN '0-10k'
          WHEN odometro_num < 20000 THEN '10-20k'
          WHEN odometro_num < 30000 THEN '20-30k'
          WHEN odometro_num < 40000 THEN '30-40k'
          WHEN odometro_num < 50000 THEN '50-60k'
          WHEN odometro_num < 60000 THEN '60-70k'
          WHEN odometro_num < 80000 THEN '70-80k'
          WHEN odometro_num < 100000 THEN '80-100k'
          ELSE '100k+'
        END as faixa_km,
        COUNT(*) as qtd
      FROM veiculos
      WHERE data_referencia = $1 AND odometro_num IS NOT NULL
      GROUP BY fornecedora, faixa_km
      ORDER BY fornecedora, faixa_km
    `, [max_date]);

    // By year model
    const por_ano = await query(`
      SELECT
        fornecedora,
        ano_modelo,
        COUNT(*) as qtd
      FROM veiculos
      WHERE data_referencia = $1 AND ano_modelo IS NOT NULL AND ano_modelo > 2015
      GROUP BY fornecedora, ano_modelo
      ORDER BY fornecedora, ano_modelo
    `, [max_date]);

    return NextResponse.json({
      data_referencia: max_date,
      por_marca: por_marca ?? [],
      por_modelo: por_modelo ?? [],
      por_km: por_km ?? [],
      por_ano: por_ano ?? [],
    });
  } catch (err: any) {
    console.error('API /mix-frota error:', err);
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
