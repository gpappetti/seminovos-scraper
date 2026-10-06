export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { MODELO_UNIF, modeloUnif } from '@/lib/sql-helpers';

/* ─────────────────────────────────────────────────────────────────────────────
   FIPE integration via Parallelum API (free, 500 req/day unauthenticated)
   https://parallelum.com.br/fipe/api/v2/
   Strategy:
     1. Keep a fipe_cache table in Supabase (marca_norm+modelo_norm+ano_modelo)
     2. On request, check cache first (valid for 30 days)
     3. For cache misses, fetch from Parallelum in batches
     4. Return aggregated premium/discount stats
   ───────────────────────────────────────────────────────────────────────────── */

const PARALLELUM = 'https://parallelum.com.br/fipe/api/v2/cars';
const CACHE_DAYS = 30;

// Static brand mapping: our DB marca_norm → Parallelum brand code
const BRAND_MAP: Record<string, string> = {
  'FIAT': '21',
  'CHEVROLET': '23',
  'RENAULT': '48',
  'VOLKSWAGEN': '59',
  'HYUNDAI': '26',
  'JEEP': '29',
  'NISSAN': '43',
  'TOYOTA': '56',
  'HONDA': '25',
  'PEUGEOT': '44',
  'CITROEN': '15',
  'BMW': '7',
  'MERCEDES-BENZ': '39',
  'AUDI': '6',
  'KIA': '31',
  'MITSUBISHI': '41',
  'FORD': '22',
  'CAOA CHERY': '245',
  'GWM': '240',
  'BYD': '238',
  'LAND ROVER': '33',
  'VOLVO': '58',
  'SUBARU': '54',
  'SUZUKI': '55',
  'RAM': '272',
  'PORSCHE': '46',
  'MINI': '40',
  'LEXUS': '35',
  'JAC': '177',
};

function normalize(s: string): string {
  return (s ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarityScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 100;
  
  // Check if one contains the other
  if (nb.startsWith(na) || na.startsWith(nb)) {
    return 80 + (Math.min(na.length, nb.length) / Math.max(na.length, nb.length)) * 15;
  }
  
  // Token overlap
  const tokensA = new Set(na.split(' ').filter(t => t.length > 1));
  const tokensB = new Set(nb.split(' ').filter(t => t.length > 1));
  const intersection = [...tokensA].filter(t => tokensB.has(t));
  const union = new Set([...tokensA, ...tokensB]);
  if (union.size === 0) return 0;
  return (intersection.length / union.size) * 70;
}

async function parallelumFetch(path: string): Promise<any> {
  try {
    const res = await fetch(`${PARALLELUM}/${path}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Cache for brand models within this request (avoid refetching)
const brandModelsCache = new Map<string, any[]>();

async function getBrandModels(brandCode: string): Promise<any[]> {
  if (brandModelsCache.has(brandCode)) return brandModelsCache.get(brandCode)!;
  const models = await parallelumFetch(`brands/${brandCode}/models`);
  const result = Array.isArray(models) ? models : [];
  brandModelsCache.set(brandCode, result);
  return result;
}

async function findFipePrice(
  brandCode: string,
  modeloNorm: string,
  anoModelo: number
): Promise<{ price: number; code: string; fipeModel: string; fuel: string; refMonth: string; score: number } | null> {
  const models = await getBrandModels(brandCode);
  if (models.length === 0) return null;

  // Find best matching model
  let bestModel: any = null;
  let bestScore = 0;
  for (const m of models) {
    const score = similarityScore(modeloNorm, m.name);
    if (score > bestScore) {
      bestScore = score;
      bestModel = m;
    }
  }
  if (!bestModel || bestScore < 30) return null;

  // Get year options
  const years = await parallelumFetch(`brands/${brandCode}/models/${bestModel.code}/years`);
  if (!Array.isArray(years) || years.length === 0) return null;

  // Find matching year (try flex first, then gasoline, then diesel, then any)
  const yearStr = String(anoModelo);
  const yearMatch = years.find((y: any) => String(y.code).startsWith(`${yearStr}-5`))  // flex
    ?? years.find((y: any) => String(y.code).startsWith(`${yearStr}-1`))  // gasoline
    ?? years.find((y: any) => String(y.code).startsWith(`${yearStr}-3`))  // diesel
    ?? years.find((y: any) => String(y.code).startsWith(`${yearStr}-`));  // any
  if (!yearMatch) return null;

  // Get price
  const priceData = await parallelumFetch(`brands/${brandCode}/models/${bestModel.code}/years/${yearMatch.code}`);
  if (!priceData?.price) return null;

  const priceNum = parseFloat(
    priceData.price.replace('R$', '').replace(/\./g, '').replace(',', '.').trim()
  );
  if (isNaN(priceNum)) return null;

  return {
    price: priceNum,
    code: priceData.codeFipe ?? '',
    fipeModel: priceData.model ?? bestModel.name,
    fuel: priceData.fuel ?? '',
    refMonth: priceData.referenceMonth ?? '',
    score: bestScore,
  };
}

export async function GET() {
  try {
    // 1. Get latest date
    const [{ max_date }] = await query('SELECT MAX(data_referencia) as max_date FROM veiculos');

    // 2. Get top model groups (marca+modelo+ano) for the latest date
    // Usa MODELO_UNIF para normalizar ONIX/ONIX PLUS entre fornecedoras
    const topGroups = await query(`
      SELECT
        marca_norm,
        ${MODELO_UNIF} as modelo_norm,
        ano_modelo,
        COUNT(*) as qtd,
        ROUND(AVG(preco_num)::numeric, 0) as preco_medio
      FROM veiculos
      WHERE data_referencia = $1
        AND preco_num IS NOT NULL
        AND ano_modelo IS NOT NULL
        AND ano_modelo >= 2018
      GROUP BY marca_norm, ${MODELO_UNIF}, ano_modelo
      HAVING COUNT(*) >= 3
      ORDER BY COUNT(*) DESC
      LIMIT 200
    `, [max_date]);

    // 3. Check cache for these groups
    const cacheResult = await query(`
      SELECT marca_norm, modelo_norm, ano_modelo, fipe_preco, fipe_codigo,
             fipe_modelo, fipe_combustivel, fipe_mes_referencia, match_score
      FROM fipe_cache
      WHERE atualizado_em > NOW() - INTERVAL '${CACHE_DAYS} days'
    `);
    const cacheMap = new Map<string, any>();
    for (const row of (cacheResult ?? [])) {
      const key = `${row.marca_norm}|${row.modelo_norm}|${row.ano_modelo}`;
      cacheMap.set(key, row);
    }

    // 4. Process each group: use cache or fetch from Parallelum
    const results: any[] = [];
    let apiCalls = 0;
    const MAX_API_CALLS = 150; // Stay well under 500/day limit
    let fipeAvailable = true;

    for (const group of (topGroups ?? [])) {
      const cacheKey = `${group.marca_norm}|${group.modelo_norm}|${group.ano_modelo}`;
      const cached = cacheMap.get(cacheKey);

      if (cached && cached.fipe_preco) {
        // Use cached value
        const premio = Math.round(((Number(group.preco_medio) - Number(cached.fipe_preco)) / Number(cached.fipe_preco)) * 1000) / 10;
        results.push({
          ...group,
          fipe_preco: Number(cached.fipe_preco),
          fipe_codigo: cached.fipe_codigo,
          fipe_modelo: cached.fipe_modelo,
          match: true,
          match_score: Number(cached.match_score),
          premio_pct: premio,
        });
        continue;
      }

      // Check if we have budget for API calls
      const brandCode = BRAND_MAP[group.marca_norm];
      if (!brandCode || apiCalls >= MAX_API_CALLS) {
        results.push({ ...group, fipe_preco: null, match: false });
        continue;
      }

      // Fetch from Parallelum
      const fipeResult = await findFipePrice(brandCode, group.modelo_norm, group.ano_modelo);
      apiCalls += 3; // ~3 calls per lookup (models + years + price)

      if (fipeResult) {
        // Save to cache
        try {
          await query(`
            INSERT INTO fipe_cache (marca_norm, modelo_norm, ano_modelo, fipe_codigo, fipe_marca, fipe_modelo, fipe_preco, fipe_combustivel, fipe_mes_referencia, match_score)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (marca_norm, modelo_norm, ano_modelo)
            DO UPDATE SET fipe_preco = $7, fipe_codigo = $4, fipe_modelo = $6,
                         fipe_combustivel = $8, fipe_mes_referencia = $9,
                         match_score = $10, atualizado_em = NOW()
          `, [
            group.marca_norm, group.modelo_norm, group.ano_modelo,
            fipeResult.code, group.marca_norm, fipeResult.fipeModel,
            fipeResult.price, fipeResult.fuel, fipeResult.refMonth, fipeResult.score,
          ]);
        } catch (e) {
          console.error('Cache write error:', e);
        }

        const premio = Math.round(((Number(group.preco_medio) - fipeResult.price) / fipeResult.price) * 1000) / 10;
        results.push({
          ...group,
          fipe_preco: fipeResult.price,
          fipe_codigo: fipeResult.code,
          fipe_modelo: fipeResult.fipeModel,
          match: true,
          match_score: fipeResult.score,
          premio_pct: premio,
        });
      } else {
        // Save negative cache too (avoid re-querying)
        try {
          await query(`
            INSERT INTO fipe_cache (marca_norm, modelo_norm, ano_modelo, fipe_preco, match_score)
            VALUES ($1, $2, $3, NULL, 0)
            ON CONFLICT (marca_norm, modelo_norm, ano_modelo)
            DO UPDATE SET fipe_preco = NULL, match_score = 0, atualizado_em = NOW()
          `, [group.marca_norm, group.modelo_norm, group.ano_modelo]);
        } catch (e) {
          console.error('Cache write error:', e);
        }
        results.push({ ...group, fipe_preco: null, match: false });
      }
    }

    // 5. Aggregate stats by fornecedora
    // Get fornecedora breakdown for matched models
    const fornData = await query(`
      SELECT
        v.fornecedora,
        v.marca_norm,
        ${modeloUnif('v')} as modelo_norm,
        v.ano_modelo,
        COUNT(*) as qtd,
        ROUND(AVG(v.preco_num)::numeric, 0) as preco_medio
      FROM veiculos v
      WHERE v.data_referencia = $1
        AND v.preco_num IS NOT NULL
        AND v.ano_modelo IS NOT NULL
        AND v.ano_modelo >= 2018
      GROUP BY v.fornecedora, v.marca_norm, ${modeloUnif('v')}, v.ano_modelo
      HAVING COUNT(*) >= 3
      ORDER BY COUNT(*) DESC
    `, [max_date]);

    // Build FIPE price lookup from results
    const fipeLookup = new Map<string, number>();
    for (const r of results) {
      if (r.match && r.fipe_preco) {
        fipeLookup.set(`${r.marca_norm}|${r.modelo_norm}|${r.ano_modelo}`, r.fipe_preco);
      }
    }

    // Calculate per-fornecedora stats
    const statsByForn: Record<string, any> = {};
    for (const forn of ['LOCALIZA', 'MOVIDA']) {
      const fornRows = (fornData ?? []).filter((r: any) => r.fornecedora === forn);
      let totalQtd = 0;
      let matchedQtd = 0;
      let premioSum = 0;
      let premioCount = 0;
      const campeoes: any[] = [];

      for (const row of fornRows) {
        const qtd = Number(row.qtd);
        totalQtd += qtd;
        const fp = fipeLookup.get(`${row.marca_norm}|${row.modelo_norm}|${row.ano_modelo}`);
        if (fp) {
          matchedQtd += qtd;
          const premio = ((Number(row.preco_medio) - fp) / fp) * 100;
          premioSum += premio * qtd; // Weighted
          premioCount += qtd;
          campeoes.push({
            marca: row.marca_norm,
            modelo: row.modelo_norm,
            ano_modelo: row.ano_modelo,
            qtd,
            preco_medio: Number(row.preco_medio),
            fipe_preco: fp,
            premio_pct: Math.round(premio * 10) / 10,
          });
        }
      }

      // Sort campeoes by quantity desc, take top 10
      campeoes.sort((a, b) => b.qtd - a.qtd);

      statsByForn[forn] = {
        total: totalQtd,
        matched: matchedQtd,
        cobertura: totalQtd > 0 ? Math.round((matchedQtd / totalQtd) * 1000) / 10 : 0,
        premio_medio: premioCount > 0 ? Math.round((premioSum / premioCount) * 10) / 10 : 0,
        campeoes: campeoes.slice(0, 10),
      };
    }

    // 6. Scatter data
    const scatter = await query(`
      SELECT
        fornecedora,
        preco_num as preco,
        odometro_num as km
      FROM veiculos
      WHERE data_referencia = $1
        AND preco_num IS NOT NULL
        AND odometro_num IS NOT NULL
        AND preco_num BETWEEN 30000 AND 300000
        AND odometro_num BETWEEN 0 AND 200000
      ORDER BY RANDOM()
      LIMIT 2000
    `, [max_date]);

    // 7. Premium/discount by km range (for matched vehicles only)
    const fipeByKm = await query(`
      SELECT
        v.fornecedora,
        CASE
          WHEN v.odometro_num < 20000 THEN '0-20k'
          WHEN v.odometro_num < 40000 THEN '20-40k'
          WHEN v.odometro_num < 60000 THEN '40-60k'
          WHEN v.odometro_num < 80000 THEN '60-80k'
          ELSE '80k+'
        END as faixa_km,
        ROUND(AVG(v.preco_num)::numeric, 0) as preco_medio,
        COUNT(*) as qtd
      FROM veiculos v
      WHERE v.data_referencia = $1
        AND v.preco_num IS NOT NULL
        AND v.odometro_num IS NOT NULL
      GROUP BY v.fornecedora, faixa_km
      ORDER BY v.fornecedora, faixa_km
    `, [max_date]);

    const matched = results.filter(r => r.match);
    const totalAnuncios = (topGroups ?? []).reduce((s: number, r: any) => s + Number(r.qtd), 0);
    const matchedAnuncios = matched.reduce((s: number, r: any) => s + Number(r.qtd), 0);

    return NextResponse.json({
      data_referencia: max_date,
      fipe_disponivel: matched.length > 0,
      fipe_mes_referencia: matched[0]?.fipe_modelo ? (results.find(r => r.match)?.fipe_modelo ?? '') : '',
      api_calls_usadas: apiCalls,
      cobertura_geral: totalAnuncios > 0
        ? Math.round((matchedAnuncios / totalAnuncios) * 1000) / 10
        : 0,
      stats: statsByForn,
      detalhes: results,
      fipe_por_km: fipeByKm ?? [],
      scatter: scatter ?? [],
    });
  } catch (err: any) {
    console.error('API /fipe error:', err);
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
