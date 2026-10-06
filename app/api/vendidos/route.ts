export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { MODELO_UNIF } from '@/lib/sql-helpers';

/* ─────────────────────────────────────────────────────────────────────────────
   Veículos Vendidos — proxy de saída (regra de confirmação por 3 snapshots)

   PROBLEMA: o scraper captura dados parciais em ~40% dos dias. Quando um snapshot
   é parcial, milhares de veículos "somem" e reaparecem 1-3 dias depois (~94%
   reaparecem). A regra antiga (ausente no dia seguinte = vendido) inflava as
   vendas em ~4x (ex.: 56k/mês Localiza vs. ~12k real).

   REGRA v3: um veículo presente no snapshot D_i só é contado como vendido se
   estiver AUSENTE de TODOS os 3 snapshots seguintes (D_i+1, D_i+2, D_i+3).
   Se reaparecer em qualquer um dos 3, foi buraco de coleta — não é venda.
   A venda é atribuída ao 1º dia de ausência (D_i+1).

   JANELA DE CONFIRMAÇÃO: as vendas dos últimos snapshots só ficam "confirmadas"
   quando existem 3 snapshots posteriores. Os dias mais recentes que ainda não
   têm essa janela completa são PROVISÓRIOS e ficam de fora dos agregados
   (evita reintroduzir a inflação da regra antiga na borda). Por isso o "último
   dia" reportado é a data de venda mais recente já CONFIRMADA, que costuma ficar
   alguns dias atrás do snapshot mais recente.

   Fingerprint: fornecedora + marca_norm + modelo_unif + ano_modelo_raw + odometro
     - SEM cidade_estado → elimina falsos positivos de transferências (~31%)
     - SEM versao → evita divergências de nomenclatura entre fornecedoras
     - DISTINCT → deduplica linhas repetidas no mesmo dia
   Cache: vendidos_cache / top_vendidos_cache (cache_version=3). Só datas
   totalmente confirmadas são gravadas; provisórias nunca são cacheadas.
   ───────────────────────────────────────────────────────────────────────────── */

const CONFIRM_WINDOW = 3; // nº de snapshots seguintes que precisam confirmar a ausência
const CACHE_VERSION = 3;

// Calcula vendas para uma data-base D_i: presentes em D_i que estão ausentes de
// TODAS as datas de confirmação (os próximos snapshots). Opcionalmente cacheia.
async function computeAndCacheSold(
  baseDate: string,
  soldDate: string,
  confirmDates: string[],
  doCache: boolean,
) {
  const soldRows = await query(`
    SELECT fornecedora, COUNT(*) as vendidos
    FROM (
      SELECT DISTINCT fornecedora, marca_norm, ${MODELO_UNIF} as modelo_u, ano_modelo_raw, odometro
      FROM veiculos WHERE data_referencia = $1
      EXCEPT
      SELECT DISTINCT fornecedora, marca_norm, ${MODELO_UNIF} as modelo_u, ano_modelo_raw, odometro
      FROM veiculos WHERE data_referencia = ANY($2::date[])
    ) diff
    GROUP BY fornecedora
  `, [baseDate, confirmDates]);

  if (doCache) {
    for (const r of soldRows) {
      await query(`
        INSERT INTO vendidos_cache (prev_date, curr_date, fornecedora, vendidos, cache_version)
        VALUES ($1, $2, $3, $4, ${CACHE_VERSION})
        ON CONFLICT (prev_date, curr_date, fornecedora)
        DO UPDATE SET vendidos = $4, cache_version = ${CACHE_VERSION}, calculado_em = NOW()
      `, [baseDate, soldDate, r.fornecedora, r.vendidos]);
    }
  }

  return soldRows.map((r: any) => ({
    fornecedora: r.fornecedora as string,
    vendidos: Number(r.vendidos),
  }));
}

export async function GET() {
  try {
    // 1. Get all available dates (ordered desc)
    const datesRows = await query(
      'SELECT DISTINCT data_referencia FROM veiculos ORDER BY data_referencia DESC'
    );
    const allDates: string[] = datesRows.map(
      (r: any) => new Date(r.data_referencia).toISOString().slice(0, 10)
    );
    if (allDates.length < 2) {
      return NextResponse.json({ error: 'Dados insuficientes' }, { status: 400 });
    }

    const latestDate = allDates[0];
    const latestDateObj = new Date(latestDate + 'T00:00:00Z');

    // Determine period boundaries
    const dayOfWeek = latestDateObj.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(latestDateObj);
    weekStart.setUTCDate(weekStart.getUTCDate() - mondayOffset);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const monthStartStr = latestDate.slice(0, 7) + '-01';

    const qMonth = Math.floor(latestDateObj.getUTCMonth() / 3) * 3;
    const quarterStart = new Date(Date.UTC(latestDateObj.getUTCFullYear(), qMonth, 1));
    const quarterStartStr = quarterStart.toISOString().slice(0, 10);

    // 2. Build the ordered list of dates to process.
    //    We need one snapshot before the quarter start (base for the 1st sold date)
    //    plus enough future snapshots to confirm the trailing dates. All quarter
    //    dates plus the day before are enough because the confirmation window only
    //    looks forward, and the newest dates are simply left provisional.
    const relevantDates = allDates.filter(d => d >= quarterStartStr).sort();
    const dateBeforeQuarter = allDates.find(d => d < quarterStartStr);
    const datesToProcess = dateBeforeQuarter
      ? [dateBeforeQuarter, ...relevantDates]
      : relevantDates;

    if (datesToProcess.length < 2) {
      return NextResponse.json({ error: 'Dados insuficientes' }, { status: 400 });
    }

    // 3. Invalidate stale cache (bump to v3: regra de confirmação por 3 snapshots).
    try {
      await query(`ALTER TABLE vendidos_cache ADD COLUMN IF NOT EXISTS cache_version INTEGER DEFAULT NULL`);
      await query(`ALTER TABLE top_vendidos_cache ADD COLUMN IF NOT EXISTS cache_version INTEGER DEFAULT NULL`);
      await query('DELETE FROM vendidos_cache WHERE cache_version IS NULL OR cache_version < $1', [CACHE_VERSION]);
      await query('DELETE FROM top_vendidos_cache WHERE cache_version IS NULL OR cache_version < $1', [CACHE_VERSION]);
    } catch { /* columns may already exist */ }

    // 4. Read cache for already-confirmed sold dates
    const cached = await query(`
      SELECT prev_date, curr_date, fornecedora, vendidos
      FROM vendidos_cache
      WHERE prev_date >= $1 AND cache_version = $2
    `, [dateBeforeQuarter ?? quarterStartStr, CACHE_VERSION]);

    const cacheMap = new Map<string, { fornecedora: string; vendidos: number }[]>();
    for (const r of (cached ?? [])) {
      const key = `${new Date(r.prev_date).toISOString().slice(0,10)}|${new Date(r.curr_date).toISOString().slice(0,10)}`;
      if (!cacheMap.has(key)) cacheMap.set(key, []);
      cacheMap.get(key)!.push({ fornecedora: r.fornecedora, vendidos: Number(r.vendidos) });
    }

    // 5. Walk the timeline. For each base date D_i, the sold date is D_i+1 and the
    //    confirmation window is the next CONFIRM_WINDOW snapshots. Only dates whose
    //    window is complete are counted (confirmed); newer dates stay provisional.
    const dailySales: { data: string; fornecedora: string; vendidos: number }[] = [];
    const confirmedPairs: { base: string; sold: string; confirmDates: string[] }[] = [];
    const N = datesToProcess.length;

    for (let i = 0; i < N - 1; i++) {
      const baseDate = datesToProcess[i];
      const soldDate = datesToProcess[i + 1];
      const confirmDates = datesToProcess.slice(i + 1, i + 1 + CONFIRM_WINDOW);
      if (confirmDates.length < CONFIRM_WINDOW) continue; // provisório → fora dos agregados

      const key = `${baseDate}|${soldDate}`;
      let results = cacheMap.get(key);
      if (!results || results.length === 0) {
        results = await computeAndCacheSold(baseDate, soldDate, confirmDates, true);
      }

      confirmedPairs.push({ base: baseDate, sold: soldDate, confirmDates });
      for (const r of results) {
        dailySales.push({ data: soldDate, fornecedora: r.fornecedora, vendidos: r.vendidos });
      }
    }

    if (confirmedPairs.length === 0) {
      return NextResponse.json({ error: 'Dados insuficientes para confirmação' }, { status: 400 });
    }

    // 6. Aggregate (só datas confirmadas entram)
    const agg = (forn: string, fromDate: string, toDate: string) =>
      dailySales
        .filter(s => s.fornecedora === forn && s.data >= fromDate && s.data <= toDate)
        .reduce((sum, s) => sum + s.vendidos, 0);

    const lastPair = confirmedPairs[confirmedPairs.length - 1];
    const prevPair = confirmedPairs.length >= 2 ? confirmedPairs[confirmedPairs.length - 2] : null;
    const lastConfirmedDate = lastPair.sold;

    const lastSales = (forn: string) =>
      dailySales.filter(s => s.fornecedora === forn && s.data === lastPair.sold)
        .reduce((s, r) => s + r.vendidos, 0);
    const prevSales = (forn: string) =>
      prevPair
        ? dailySales.filter(s => s.fornecedora === forn && s.data === prevPair.sold)
            .reduce((s, r) => s + r.vendidos, 0)
        : null;

    const buildStats = (forn: string) => {
      const ud = lastSales(forn);
      const da = prevSales(forn);
      return {
        ultimo_dia: ud,
        dia_anterior: da,
        var_dia: da != null ? ud - da : null,
        semana: agg(forn, weekStartStr, latestDate),
        mes: agg(forn, monthStartStr, latestDate),
        trimestre: agg(forn, quarterStartStr, latestDate),
      };
    };

    // 7. Time series for chart (last 30 days de datas confirmadas)
    const thirtyAgo = new Date(latestDateObj);
    thirtyAgo.setUTCDate(thirtyAgo.getUTCDate() - 30);
    const thirtyAgoStr = thirtyAgo.toISOString().slice(0, 10);

    const dateSet = new Set(dailySales.filter(s => s.data >= thirtyAgoStr).map(s => s.data));
    const sortedDates = Array.from(dateSet).sort();
    const serie = sortedDates.map(d => {
      const loc = dailySales.filter(s => s.data === d && s.fornecedora === 'LOCALIZA')
        .reduce((s, r) => s + r.vendidos, 0);
      const mov = dailySales.filter(s => s.data === d && s.fornecedora === 'MOVIDA')
        .reduce((s, r) => s + r.vendidos, 0);
      return { data: d, localiza: loc, movida: mov, total: loc + mov };
    });

    // 8. Top models sold na última data CONFIRMADA (cache ou compute)
    let topSoldRows = await query(`
      SELECT fornecedora, marca_norm, modelo_norm, qtd_vendidos, ticket_medio
      FROM top_vendidos_cache
      WHERE prev_date = $1 AND curr_date = $2 AND cache_version = $3
      ORDER BY qtd_vendidos DESC
      LIMIT 20
    `, [lastPair.base, lastPair.sold, CACHE_VERSION]);

    if (!topSoldRows || topSoldRows.length === 0) {
      topSoldRows = await query(`
        WITH sold AS (
          SELECT DISTINCT fornecedora, marca_norm, ${MODELO_UNIF} as modelo_u, ano_modelo_raw, odometro
          FROM veiculos WHERE data_referencia = $1
          EXCEPT
          SELECT DISTINCT fornecedora, marca_norm, ${MODELO_UNIF} as modelo_u, ano_modelo_raw, odometro
          FROM veiculos WHERE data_referencia = ANY($2::date[])
        )
        SELECT s.fornecedora,
               s.marca_norm,
               s.modelo_u as modelo_norm,
               COUNT(*) as qtd_vendidos,
               ROUND(AVG(v.preco_num)::numeric, 0) as ticket_medio
        FROM sold s
        JOIN veiculos v
          ON v.data_referencia = $1
          AND v.fornecedora = s.fornecedora
          AND v.marca_norm = s.marca_norm
          AND v.ano_modelo_raw = s.ano_modelo_raw
          AND v.odometro = s.odometro
        WHERE v.preco_num IS NOT NULL
        GROUP BY s.fornecedora, s.marca_norm, s.modelo_u
        ORDER BY COUNT(*) DESC
        LIMIT 20
      `, [lastPair.base, lastPair.confirmDates]);

      for (const r of (topSoldRows ?? [])) {
        await query(`
          INSERT INTO top_vendidos_cache (prev_date, curr_date, fornecedora, marca_norm, modelo_norm, qtd_vendidos, ticket_medio, cache_version)
          VALUES ($1, $2, $3, $4, $5, $6, $7, ${CACHE_VERSION})
          ON CONFLICT (prev_date, curr_date, fornecedora, marca_norm, modelo_norm)
          DO UPDATE SET qtd_vendidos = $6, ticket_medio = $7, cache_version = ${CACHE_VERSION}, calculado_em = NOW()
        `, [lastPair.base, lastPair.sold, r.fornecedora, r.marca_norm, r.modelo_norm, r.qtd_vendidos, r.ticket_medio]);
      }
    }

    return NextResponse.json({
      data_referencia: latestDate,
      ultima_data_confirmada: lastConfirmedDate,
      confirm_window: CONFIRM_WINDOW,
      periodo_referencia: { prev: lastPair.base, curr: lastPair.sold },
      week_start: weekStartStr,
      month_start: monthStartStr,
      quarter_start: quarterStartStr,
      stats: {
        LOCALIZA: buildStats('LOCALIZA'),
        MOVIDA: buildStats('MOVIDA'),
      },
      serie,
      top_vendidos: topSoldRows ?? [],
    });
  } catch (err: any) {
    console.error('API /vendidos error:', err);
    return NextResponse.json({ error: err?.message ?? 'Erro interno' }, { status: 500 });
  }
}
