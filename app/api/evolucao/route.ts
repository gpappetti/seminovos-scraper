export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    // Historical evolution: price, km, count per date per fornecedora
    const serie = await query(`
      SELECT
        data_referencia,
        fornecedora,
        COUNT(*) as total,
        ROUND(AVG(preco_num)::numeric, 0) as media_preco,
        ROUND(AVG(odometro_num)::numeric, 0) as media_km,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY preco_num) as mediana_preco,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY odometro_num) as mediana_km
      FROM veiculos
      WHERE preco_num IS NOT NULL
        AND odometro_num IS NOT NULL
      GROUP BY data_referencia, fornecedora
      ORDER BY data_referencia ASC, fornecedora
    `);

    // Brands over time (top 8 per fornecedora)
    const marcas_tempo = await query(`
      WITH top_marcas AS (
        SELECT fornecedora, marca_norm,
          ROW_NUMBER() OVER (PARTITION BY fornecedora ORDER BY COUNT(*) DESC) as rn
        FROM veiculos
        WHERE preco_num IS NOT NULL
        GROUP BY fornecedora, marca_norm
      )
      SELECT
        v.data_referencia,
        v.fornecedora,
        v.marca_norm as marca,
        COUNT(*) as qtd
      FROM veiculos v
      JOIN top_marcas tm ON v.fornecedora = tm.fornecedora AND v.marca_norm = tm.marca_norm AND tm.rn <= 8
      WHERE v.preco_num IS NOT NULL
      GROUP BY v.data_referencia, v.fornecedora, v.marca_norm
      ORDER BY v.data_referencia ASC
    `);

    // Category (body type approximation via modelo) over time
    const categorias_tempo = await query(`
      WITH categorias AS (
        SELECT
          data_referencia,
          fornecedora,
          CASE
            WHEN UPPER(modelo) IN ('HB20','ONIX','POLO','GOL','ARGO','MOBI','KWID','KA','CITY','YARIS','FIT','VERSA','MARCH','LOGAN','SANDERO','C3','CRUZE','COROLLA','CIVIC','SENTRA','VIRTUS','VOYAGE','COBALT','PRISMA') THEN 'Hatch / Sedan'
            WHEN UPPER(modelo) IN ('RENEGADE','COMPASS','COMMANDER','TRACKER','CRETA','TUCSON','IX35','TIGGO','T-CROSS','NIVUS','KICKS','DUSTER','CAPTUR','TAOS','COROLLA CROSS','HR-V','SPORTAGE','SELTOS','ECLIPSE CROSS','OUTLANDER','RAV4') THEN 'SUV'
            WHEN UPPER(modelo) IN ('TORO','STRADA','SAVEIRO','MONTANA','S10','HILUX','RANGER','AMAROK','FRONTIER','OROCH','RAMPAGE') THEN 'Picape'
            WHEN UPPER(modelo) IN ('SPIN','ONIX PLUS','CRONOS','HB20S','CITY SEDAN') THEN 'Hatch / Sedan'
            ELSE 'Outros'
          END as categoria,
          1 as cnt
        FROM veiculos
        WHERE preco_num IS NOT NULL
      )
      SELECT
        data_referencia,
        fornecedora,
        categoria,
        COUNT(*) as qtd
      FROM categorias
      GROUP BY data_referencia, fornecedora, categoria
      ORDER BY data_referencia ASC
    `);

    return NextResponse.json({
      serie: serie ?? [],
      marcas_tempo: marcas_tempo ?? [],
      categorias_tempo: categorias_tempo ?? [],
    });
  } catch (err: any) {
    console.error('API /evolucao error:', err);
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
