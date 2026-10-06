'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Header } from './header';
import { SidebarNav } from './sidebar-nav';
import { SectionHeader } from './section-header';
import { MetricCard } from './metric-card';
import {
  EvoLineChart, StackedAreaChart, HBarChart, VBarChart,
  PriceKmScatter, PremiumBar,
  formatBR, formatDate, COLORS,
} from './charts';
import {
  Activity, TrendingUp, PieChart, Scale, BookOpen,
  Car, DollarSign, Gauge, MapPin, Calendar, Loader2,
  AlertTriangle, ShoppingCart, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// --- Types ---
interface PulsoData {
  data_referencia: string;
  pulso: any[];
  indicadores: any[];
  campeoes: { LOCALIZA: any[]; MOVIDA: any[] };
}
interface EvoData {
  serie: any[];
  marcas_tempo: any[];
  categorias_tempo: any[];
}
interface MixData {
  data_referencia: string;
  por_marca: any[];
  por_modelo: any[];
  por_km: any[];
  por_ano: any[];
}
interface FipeData {
  data_referencia: string;
  fipe_disponivel: boolean;
  detalhes: any[];
  stats: Record<string, { total: number; matched: number; cobertura: number; premio_medio: number; campeoes: any[] }>;
  cobertura_geral: number;
  fipe_por_km: any[];
  scatter: any[];
}
interface VendidosData {
  data_referencia: string;
  ultima_data_confirmada?: string;
  confirm_window?: number;
  periodo_referencia: { prev: string; curr: string };
  stats: Record<string, {
    ultimo_dia: number; dia_anterior: number | null; var_dia: number | null;
    semana: number; mes: number; trimestre: number;
  }>;
  serie: { data: string; localiza: number; movida: number; total: number }[];
  top_vendidos: any[];
}

function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) {
          if (d?.error) setError(d.error);
          else setData(d);
          setLoading(false);
        }
      })
      .catch(e => {
        if (!cancelled) { setError(e?.message ?? 'Erro'); setLoading(false); }
      });
    return () => { cancelled = true; };
  }, [url]);

  return { data, loading, error };
}

function LoadingState({ text }: { text?: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-primary mr-3" />
      <span className="text-sm text-muted-foreground">{text ?? 'Carregando dados...'}</span>
    </div>
  );
}

function ErrorState({ msg }: { msg: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-red-400">
      <AlertTriangle className="h-5 w-5 mr-2" />
      <span className="text-sm">{msg}</span>
    </div>
  );
}

// Helper to format date label
function fmtDateLabel(d: string | undefined | null): string {
  if (!d) return '';
  const dt = new Date(String(d));
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

export function Dashboard() {
  const [activeSection, setActiveSection] = useState('pulso');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const { data: pulso, loading: loadPulso, error: errPulso } = useFetch<PulsoData>('/api/pulso');
  const { data: vendidos, loading: loadVendidos, error: errVendidos } = useFetch<VendidosData>('/api/vendidos');
  const { data: evo, loading: loadEvo, error: errEvo } = useFetch<EvoData>('/api/evolucao');
  const { data: mix, loading: loadMix, error: errMix } = useFetch<MixData>('/api/mix-frota');
  const { data: fipe, loading: loadFipe, error: errFipe } = useFetch<FipeData>('/api/fipe');

  const scrollTo = useCallback((id: string) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Intersection observer for active section
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry?.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-100px 0px -60% 0px' }
    );

    const ids = ['pulso', 'vendidos', 'evolucao', 'mix', 'fipe', 'metodologia'];
    ids.forEach(id => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [loadPulso, loadVendidos, loadEvo, loadMix, loadFipe]);

  // Prepare evo data
  const evoPreco = prepareEvoSeries(evo?.serie ?? [], 'media_preco');
  const evoKm = prepareEvoSeries(evo?.serie ?? [], 'media_km');

  // Prepare brand stacked area
  const { data: marcasLocData, keys: marcasLocKeys } = prepareBrandSeries(evo?.marcas_tempo ?? [], 'LOCALIZA');
  const { data: marcasMovData, keys: marcasMovKeys } = prepareBrandSeries(evo?.marcas_tempo ?? [], 'MOVIDA');

  // Prepare mix data
  const mixMarcaLoc = (mix?.por_marca ?? []).filter((r: any) => r?.fornecedora === 'LOCALIZA').slice(0, 10).map((r: any) => ({ name: r?.marca ?? '', qtd: Number(r?.qtd ?? 0) }));
  const mixMarcaMov = (mix?.por_marca ?? []).filter((r: any) => r?.fornecedora === 'MOVIDA').slice(0, 10).map((r: any) => ({ name: r?.marca ?? '', qtd: Number(r?.qtd ?? 0) }));
  const mixModeloLoc = (mix?.por_modelo ?? []).filter((r: any) => r?.fornecedora === 'LOCALIZA').slice(0, 10).map((r: any) => ({ name: r?.modelo ?? '', qtd: Number(r?.qtd ?? 0) }));
  const mixModeloMov = (mix?.por_modelo ?? []).filter((r: any) => r?.fornecedora === 'MOVIDA').slice(0, 10).map((r: any) => ({ name: r?.modelo ?? '', qtd: Number(r?.qtd ?? 0) }));
  const mixKmLoc = (mix?.por_km ?? []).filter((r: any) => r?.fornecedora === 'LOCALIZA').map((r: any) => ({ name: r?.faixa_km ?? '', qtd: Number(r?.qtd ?? 0) }));
  const mixKmMov = (mix?.por_km ?? []).filter((r: any) => r?.fornecedora === 'MOVIDA').map((r: any) => ({ name: r?.faixa_km ?? '', qtd: Number(r?.qtd ?? 0) }));
  const mixAnoLoc = (mix?.por_ano ?? []).filter((r: any) => r?.fornecedora === 'LOCALIZA').map((r: any) => ({ name: String(r?.ano_modelo ?? ''), qtd: Number(r?.qtd ?? 0) }));
  const mixAnoMov = (mix?.por_ano ?? []).filter((r: any) => r?.fornecedora === 'MOVIDA').map((r: any) => ({ name: String(r?.ano_modelo ?? ''), qtd: Number(r?.qtd ?? 0) }));

  // Prepare FIPE champions from stats.campeoes (per fornecedora)
  const fipeLocCampeoes = (fipe?.stats?.LOCALIZA?.campeoes ?? []).slice(0, 8);
  const fipeMovCampeoes = (fipe?.stats?.MOVIDA?.campeoes ?? []).slice(0, 8);
  const fipeLoc = fipeLocCampeoes.map((r: any) => ({ modelo: r?.modelo ?? '', premio_pct: r?.premio_pct ?? 0 }));
  const fipeMov = fipeMovCampeoes.map((r: any) => ({ modelo: r?.modelo ?? '', premio_pct: r?.premio_pct ?? 0 }));

  // Pulso per forn
  const pulsoLoc = (pulso?.pulso ?? []).find((r: any) => r?.fornecedora === 'LOCALIZA');
  const pulsoMov = (pulso?.pulso ?? []).find((r: any) => r?.fornecedora === 'MOVIDA');

  // Indicators
  const indAtualLoc = (pulso?.indicadores ?? []).find((r: any) => r?.fornecedora === 'LOCALIZA' && r?.periodo === 'atual');
  const indAntLoc = (pulso?.indicadores ?? []).find((r: any) => r?.fornecedora === 'LOCALIZA' && r?.periodo === 'anterior');
  const indAtualMov = (pulso?.indicadores ?? []).find((r: any) => r?.fornecedora === 'MOVIDA' && r?.periodo === 'atual');
  const indAntMov = (pulso?.indicadores ?? []).find((r: any) => r?.fornecedora === 'MOVIDA' && r?.periodo === 'anterior');

  const calcTrend = (atual: any, ant: any, key: string) => {
    const a = Number(atual?.[key] ?? 0);
    const b = Number(ant?.[key] ?? 0);
    if (b === 0) return 0;
    return Math.round(((a - b) / b) * 1000) / 10;
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <SidebarNav activeSection={activeSection} onNavigate={scrollTo} />

      <main className="lg:ml-56 pt-4 pb-16">
        <div className="mx-auto max-w-[1100px] px-4 sm:px-6">

          {/* Hero */}
          <div className="mb-8 rounded-xl bg-gradient-to-br from-primary/15 via-card to-card border border-border/50 p-6">
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <span className="text-2xl">🔬</span> Seminovos X-Ray
            </h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
              Raio-X do mercado de usados pela lente das locadoras — todos os veículos anunciados nas
              páginas de seminovos de Localiza e Movida, cruzados com a FIPE.
              {pulso?.data_referencia && (
                <span className="ml-1 font-medium text-foreground">
                  Snapshot de {fmtDateLabel(pulso.data_referencia)}.
                </span>
              )}
            </p>
          </div>

          {/* ===== SECTION: PULSO ===== */}
          <section id="pulso" ref={(el) => { sectionRefs.current['pulso'] = el; }}>
            <SectionHeader
              icon={<Activity className="h-5 w-5 text-primary" />}
              title="Pulso do Mercado"
              subtitle="Total de veículos anunciados, mediana de preço e de quilometragem por fornecedora."
            />

            {loadPulso ? <LoadingState /> : errPulso ? <ErrorState msg={errPulso} /> : (
              <>
                {/* Metric cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  <MetricCard
                    label="Localiza · Anúncios"
                    value={formatBR(Number(pulsoLoc?.total ?? 0))}
                    subtitle={`mediana R$ ${formatBR(Math.round(Number(pulsoLoc?.mediana_preco ?? 0)))} · ${formatBR(Math.round(Number(pulsoLoc?.mediana_km ?? 0)))} km`}
                    icon={<Car className="h-4 w-4" />}
                    color="orange"
                  />
                  <MetricCard
                    label="Movida · Anúncios"
                    value={formatBR(Number(pulsoMov?.total ?? 0))}
                    subtitle={`mediana R$ ${formatBR(Math.round(Number(pulsoMov?.mediana_preco ?? 0)))} · ${formatBR(Math.round(Number(pulsoMov?.mediana_km ?? 0)))} km`}
                    icon={<Car className="h-4 w-4" />}
                    color="blue"
                  />
                  <MetricCard
                    label="Total Combinado"
                    value={formatBR(Number(pulsoLoc?.total ?? 0) + Number(pulsoMov?.total ?? 0))}
                    subtitle="Localiza + Movida"
                    icon={<Activity className="h-4 w-4" />}
                    color="green"
                  />
                </div>

                {/* Indicators */}
                <div className="mb-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Indicadores — última coleta vs média anterior
                  </p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <MetricCard
                      label="Km Médio · Localiza"
                      value={`${formatBR(Number(indAtualLoc?.media_km ?? 0))} km`}
                      trend={calcTrend(indAtualLoc, indAntLoc, 'media_km')}
                      color="orange"
                    />
                    <MetricCard
                      label="Preço Médio · Localiza"
                      value={`R$ ${formatBR(Number(indAtualLoc?.media_preco ?? 0))}`}
                      trend={calcTrend(indAtualLoc, indAntLoc, 'media_preco')}
                      color="orange"
                    />
                    <MetricCard
                      label="Km Médio · Movida"
                      value={`${formatBR(Number(indAtualMov?.media_km ?? 0))} km`}
                      trend={calcTrend(indAtualMov, indAntMov, 'media_km')}
                      color="blue"
                    />
                    <MetricCard
                      label="Preço Médio · Movida"
                      value={`R$ ${formatBR(Number(indAtualMov?.media_preco ?? 0))}`}
                      trend={calcTrend(indAtualMov, indAntMov, 'media_preco')}
                      color="blue"
                    />
                  </div>
                </div>

                {/* Champions table */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
                  <ChampionsTable title="Localiza — campeões" data={pulso?.campeoes?.LOCALIZA ?? []} color="orange" />
                  <ChampionsTable title="Movida — campeões" data={pulso?.campeoes?.MOVIDA ?? []} color="blue" />
                </div>
              </>
            )}
          </section>

          {/* ===== SECTION: VENDIDOS ===== */}
          <section id="vendidos" ref={(el) => { sectionRefs.current['vendidos'] = el; }} className="mt-12">
            <SectionHeader
              icon={<ShoppingCart className="h-5 w-5 text-primary" />}
              title="Veículos Vendidos"
              subtitle="Proxy de saída: um veículo só é contado como vendido quando some do catálogo e permanece ausente nos 3 snapshots seguintes — isso filtra buracos de coleta (carros que reaparecem em 1-3 dias)."
            />

            {loadVendidos ? <LoadingState text="Calculando vendas..." /> : errVendidos ? <ErrorState msg={errVendidos} /> : (
              <>
                {/* Cards de resumo por fornecedora */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  {(['LOCALIZA', 'MOVIDA'] as const).map((forn) => {
                    const s = vendidos?.stats?.[forn];
                    const color = forn === 'LOCALIZA' ? 'orange' : 'blue';
                    const borderColor = color === 'orange' ? 'border-t-orange-500' : 'border-t-blue-500';
                    const pillBg = color === 'orange' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400';
                    const varDia = s?.var_dia ?? 0;
                    return (
                      <div key={forn} className={cn('rounded-lg border border-border/50 bg-card overflow-hidden border-t-[3px]', borderColor)}>
                        <div className="px-5 py-3 border-b border-border/30 flex items-center gap-2">
                          <p className="text-sm font-bold">{forn}</p>
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', pillBg)}>vendas</span>
                        </div>
                        <div className="px-5 py-4">
                          {/* Último dia */}
                          <div className="flex items-baseline gap-3 mb-3">
                            <span className="text-3xl font-extrabold tracking-tight">
                              {formatBR(s?.ultimo_dia ?? 0)}
                            </span>
                            <span className="text-sm text-muted-foreground">vendidos no último dia</span>
                            {s?.dia_anterior != null && (
                              <span className={cn(
                                'flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full',
                                varDia > 0
                                  ? 'bg-emerald-500/10 text-emerald-400'
                                  : varDia < 0
                                    ? 'bg-red-500/10 text-red-400'
                                    : 'bg-muted text-muted-foreground'
                              )}>
                                {varDia > 0 ? <ArrowUpRight className="h-3 w-3" /> : varDia < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
                                {varDia > 0 ? '+' : ''}{formatBR(varDia)} vs anterior
                              </span>
                            )}
                          </div>
                          {/* Acumulados */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-md bg-muted/50 p-3 text-center">
                              <p className="text-lg font-bold">{formatBR(s?.semana ?? 0)}</p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Semana</p>
                            </div>
                            <div className="rounded-md bg-muted/50 p-3 text-center">
                              <p className="text-lg font-bold">{formatBR(s?.mes ?? 0)}</p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Mês</p>
                            </div>
                            <div className="rounded-md bg-muted/50 p-3 text-center">
                              <p className="text-lg font-bold">{formatBR(s?.trimestre ?? 0)}</p>
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Trimestre</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {vendidos?.ultima_data_confirmada && (
                  <p className="text-xs text-muted-foreground mb-6 -mt-2">
                    Vendas confirmadas até {fmtDateLabel(vendidos.ultima_data_confirmada)}. Os últimos
                    {' '}{vendidos.confirm_window ?? 3}{' '}snapshots ainda estão na janela de confirmação
                    e não entram nos totais para evitar contagem inflada por coletas parciais.
                  </p>
                )}

                {/* Gráfico de evolução de vendas diárias */}
                <div className="rounded-lg border border-border/50 bg-card p-4 mb-6">
                  <p className="text-sm font-semibold mb-3">Vendas Diárias (últimos 30 dias)</p>
                  <EvoLineChart
                    data={(vendidos?.serie ?? []).map(s => ({ date: formatDate(s.data), LOCALIZA: s.localiza, MOVIDA: s.movida }))}
                    dataKeyL="LOCALIZA"
                    dataKeyM="MOVIDA"
                    yLabel="Vendidos"
                    height={300}
                  />
                </div>

                {/* Top modelos vendidos */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TopVendidosTable
                    title="Mais Vendidos · Localiza"
                    data={(vendidos?.top_vendidos ?? []).filter((r: any) => r.fornecedora === 'LOCALIZA').slice(0, 10)}
                    color="orange"
                  />
                  <TopVendidosTable
                    title="Mais Vendidos · Movida"
                    data={(vendidos?.top_vendidos ?? []).filter((r: any) => r.fornecedora === 'MOVIDA').slice(0, 10)}
                    color="blue"
                  />
                </div>
              </>
            )}
          </section>

          {/* ===== SECTION: EVOLUCAO ===== */}
          <section id="evolucao" ref={(el) => { sectionRefs.current['evolucao'] = el; }} className="mt-12">
            <SectionHeader
              badge="Histórico"
              icon={<TrendingUp className="h-5 w-5 text-primary" />}
              title="Evolução Histórica"
              subtitle="Preço médio, quilometragem e composição das frotas ao longo do tempo."
            />

            {loadEvo ? <LoadingState text="Carregando séries históricas..." /> : errEvo ? <ErrorState msg={errEvo} /> : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-3">Preço Médio (R$)</p>
                    <EvoLineChart data={evoPreco} dataKeyL="LOCALIZA" dataKeyM="MOVIDA" yLabel="R$" />
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-3">Km Médio</p>
                    <EvoLineChart data={evoKm} dataKeyL="LOCALIZA" dataKeyM="MOVIDA" yLabel="km" />
                  </div>
                </div>

                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
                  Marcas ao longo do tempo — participação (%) na frota
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <StackedAreaChart data={marcasLocData} keys={marcasLocKeys} title="Localiza" />
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <StackedAreaChart data={marcasMovData} keys={marcasMovKeys} title="Movida" />
                  </div>
                </div>
              </>
            )}
          </section>

          {/* ===== SECTION: MIX FROTA ===== */}
          <section id="mix" ref={(el) => { sectionRefs.current['mix'] = el; }} className="mt-12">
            <SectionHeader
              icon={<PieChart className="h-5 w-5 text-primary" />}
              title="Mix da Frota"
              subtitle="Quem são esses veículos — por marca, modelo, quilometragem e ano-modelo."
            />

            {loadMix ? <LoadingState text="Carregando mix da frota..." /> : errMix ? <ErrorState msg={errMix} /> : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Por Marca</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">Localiza — top 10</p>
                    <HBarChart data={mixMarcaLoc} color={COLORS.localiza} height={320} />
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">Movida — top 10</p>
                    <HBarChart data={mixMarcaMov} color={COLORS.movida} height={320} />
                  </div>
                </div>

                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Por Modelo</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">Localiza — top 10</p>
                    <HBarChart data={mixModeloLoc} color={COLORS.localiza} height={320} />
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">Movida — top 10</p>
                    <HBarChart data={mixModeloMov} color={COLORS.movida} height={320} />
                  </div>
                </div>

                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Por Quilometragem</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">Localiza</p>
                    <VBarChart data={mixKmLoc} color={COLORS.localiza} />
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">Movida</p>
                    <VBarChart data={mixKmMov} color={COLORS.movida} />
                  </div>
                </div>

                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Por Ano-Modelo</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">Localiza</p>
                    <VBarChart data={mixAnoLoc} color={COLORS.localiza} />
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">Movida</p>
                    <VBarChart data={mixAnoMov} color={COLORS.movida} />
                  </div>
                </div>
              </>
            )}
          </section>

          {/* ===== SECTION: FIPE ===== */}
          <section id="fipe" ref={(el) => { sectionRefs.current['fipe'] = el; }} className="mt-12">
            <SectionHeader
              badge="★"
              icon={<Scale className="h-5 w-5 text-primary" />}
              title="Comparação com a FIPE — preço"
              subtitle="Quanto o preço de anúncio de cada frota fica acima (prêmio) ou abaixo (desconto) da tabela FIPE."
            />

            {loadFipe ? <LoadingState text="Consultando tabela FIPE... (pode levar alguns segundos)" /> : errFipe ? <ErrorState msg={errFipe} /> : (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <MetricCard
                    label="Localiza vs FIPE"
                    value={`${(fipe?.stats?.LOCALIZA?.premio_medio ?? 0) > 0 ? '+' : ''}${fipe?.stats?.LOCALIZA?.premio_medio ?? 0}%`}
                    subtitle={`preço de anúncio vs tabela mediana`}
                    color="orange"
                  />
                  <MetricCard
                    label="Movida vs FIPE"
                    value={`${(fipe?.stats?.MOVIDA?.premio_medio ?? 0) > 0 ? '+' : ''}${fipe?.stats?.MOVIDA?.premio_medio ?? 0}%`}
                    subtitle={`preço de anúncio vs tabela mediana`}
                    color="blue"
                  />
                  <MetricCard
                    label="Cobertura"
                    value={`~${fipe?.cobertura_geral ?? 0}%`}
                    subtitle="dos anúncios casados à FIPE"
                    color="green"
                  />
                </div>

                {/* Champions vs FIPE */}
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Campeões vs FIPE — prêmio (<span className="text-emerald-400">+</span>) ou desconto (<span className="text-red-400">−</span>), nos modelos mais anunciados
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <FipeChampionsCard forn="Localiza" data={fipeLocCampeoes} color="orange" />
                  <FipeChampionsCard forn="Movida" data={fipeMovCampeoes} color="blue" />
                </div>

                {/* Premium charts */}
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Desconto vs FIPE por faixa de km — Localiza × Movida
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">Localiza — prêmio/desconto por modelo</p>
                    <PremiumBar data={fipeLoc} height={280} />
                  </div>
                  <div className="rounded-lg border border-border/50 bg-card p-4">
                    <p className="text-xs text-muted-foreground mb-2">Movida — prêmio/desconto por modelo</p>
                    <PremiumBar data={fipeMov} height={280} />
                  </div>
                </div>

                {/* Scatter */}
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Dispersão preço × km
                </p>
                <div className="rounded-lg border border-border/50 bg-card p-4 mb-8">
                  <p className="text-xs text-muted-foreground mb-2">
                    Cada ponto é um veículo (amostra de 2.000). O preço sobe e a mediana de revenda cai conforme o km.
                  </p>
                  <PriceKmScatter data={fipe?.scatter ?? []} height={380} />
                </div>
              </>
            )}
          </section>

          {/* ===== SECTION: METODOLOGIA ===== */}
          <section id="metodologia" ref={(el) => { sectionRefs.current['metodologia'] = el; }} className="mt-12">
            <SectionHeader
              icon={<BookOpen className="h-5 w-5 text-primary" />}
              title="Metodologia"
            />

            <div className="rounded-lg border border-border/50 bg-card p-6 prose prose-sm dark:prose-invert max-w-none">
              <h3>Fontes de Dados</h3>
              <ul>
                <li>
                  <strong>Localiza Seminovos:</strong> Coleta automática diária da API pública do site
                  seminovos.localiza.com (Next.js data route). Todos os veículos listados.
                </li>
                <li>
                  <strong>Movida Seminovos:</strong> Coleta automática diária da API Elasticsearch do site
                  seminovosmovida.com.br. Todos os veículos listados.
                </li>
                <li>
                  <strong>Tabela FIPE:</strong> API pública da Fundação Instituto de Pesquisas Econômicas
                  (veiculos.fipe.org.br). Tabela de referência mais recente. Cruzamento por código FIPE
                  via normalização de marca + modelo + ano-modelo.
                </li>
              </ul>

              <h3>Periodicidade</h3>
              <p>
                Os dados são coletados diariamente às <strong>16h (horário de Brasília)</strong> por uma tarefa
                agendada. Cada coleta gera um <em>snapshot</em> completo de toda a frota anunciada naquele
                momento, permitindo análises point-in-time.
              </p>

              <h3>Modelo de Dados</h3>
              <p>
                Tabela única <code>veiculos</code> no PostgreSQL (Supabase), com colunas originais preservadas
                e colunas normalizadas (preço numérico, odômetro, cidade/estado separados, marca/modelo
                em maiúsculas). Cada linha = um veículo em um dia específico.
              </p>

              <h3>Cruzamento com a FIPE</h3>
              <p>
                A correspondência entre os nomes de marca/modelo raspados e os códigos FIPE é feita por
                normalização de texto (remoção de acentos, uppercase) e busca por similaridade.
                A <strong>cobertura</strong> indica o percentual de anúncios que foram casados com sucesso.
                Modelos com menos de 10 anúncios são excluídos do cruzamento.
              </p>

              <h3>Limitações</h3>
              <ul>
                <li>A identificação de veículo individual (para tracking de tempo no estoque) é aproximada.</li>
                <li>A FIPE tem granularidade de versão superior à dos anúncios; o cruzamento usa modelo + ano.</li>
                <li>Dias sem coleta (falhas técnicas) geram lacunas na série temporal.</li>
              </ul>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}

// --- FIPE Champions Card (prêmio/desconto por modelo) ---
function FipeChampionsCard({ forn, data, color }: { forn: string; data: any[]; color: 'orange' | 'blue' }) {
  const borderColor = color === 'orange' ? 'border-t-orange-500' : 'border-t-blue-500';
  const pillBg = color === 'orange' ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400';
  return (
    <div className={cn('rounded-lg border border-border/50 bg-card overflow-hidden border-t-[3px]', borderColor)}>
      <div className="px-4 py-3 border-b border-border/30 flex items-center gap-2">
        <p className="text-sm font-bold">{forn}</p>
        <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', pillBg)}>campeões</span>
      </div>
      <p className="px-4 pt-2 text-[11px] text-muted-foreground">preço de anúncio vs FIPE (mediana do modelo)</p>
      <div className="px-4 py-2">
        {(data ?? []).map((r: any, i: number) => {
          const prem = Number(r?.premio_pct ?? 0);
          const isPrem = prem >= 0;
          return (
            <div key={i} className="flex justify-between items-center py-2 border-b border-border/10 last:border-b-0">
              <span className="text-sm font-semibold">
                {r?.modelo ?? ''}
                <span className="text-xs text-muted-foreground font-normal ml-2">
                  {formatBR(Number(r?.qtd ?? 0))} un.
                </span>
              </span>
              <span className={cn(
                'text-xs font-bold px-3 py-1 rounded-full min-w-[60px] text-center',
                isPrem
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/10 text-red-400'
              )}>
                {isPrem ? '+' : ''}{prem.toFixed(1)}%
              </span>
            </div>
          );
        })}
        {(data ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">Sem dados FIPE disponíveis</p>
        )}
      </div>
    </div>
  );
}

// --- Champions Table ---
function ChampionsTable({ title, data, color }: { title: string; data: any[]; color: 'orange' | 'blue' }) {
  const borderColor = color === 'orange' ? 'border-l-orange-500' : 'border-l-blue-500';
  return (
    <div className={cn('rounded-lg border border-border/50 bg-card overflow-hidden border-l-[3px]', borderColor)}>
      <div className="px-4 py-3 border-b border-border/30">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/20">
              <th className="px-4 py-2 text-left text-muted-foreground font-medium">#</th>
              <th className="px-4 py-2 text-left text-muted-foreground font-medium">Modelo</th>
              <th className="px-4 py-2 text-right text-muted-foreground font-medium">Qtd</th>
              <th className="px-4 py-2 text-right text-muted-foreground font-medium">Preço Méd.</th>
              <th className="px-4 py-2 text-right text-muted-foreground font-medium">Km Méd.</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: any, i: number) => (
              <tr key={i} className="border-b border-border/10 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-mono text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-2 font-medium">
                  <span className="text-muted-foreground">{r?.marca ?? ''}</span>{' '}
                  {r?.modelo ?? ''}
                </td>
                <td className="px-4 py-2 text-right font-mono">{formatBR(Number(r?.qtd ?? 0))}</td>
                <td className="px-4 py-2 text-right font-mono">R$ {formatBR(Number(r?.preco_medio ?? 0))}</td>
                <td className="px-4 py-2 text-right font-mono">{formatBR(Number(r?.km_medio ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Top Vendidos Table ---
function TopVendidosTable({ title, data, color }: { title: string; data: any[]; color: 'orange' | 'blue' }) {
  const borderColor = color === 'orange' ? 'border-l-orange-500' : 'border-l-blue-500';
  return (
    <div className={cn('rounded-lg border border-border/50 bg-card overflow-hidden border-l-[3px]', borderColor)}>
      <div className="px-4 py-3 border-b border-border/30">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/20">
              <th className="px-4 py-2 text-left text-muted-foreground font-medium">#</th>
              <th className="px-4 py-2 text-left text-muted-foreground font-medium">Modelo</th>
              <th className="px-4 py-2 text-right text-muted-foreground font-medium">Vendidos</th>
              <th className="px-4 py-2 text-right text-muted-foreground font-medium">Ticket Méd.</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((r: any, i: number) => (
              <tr key={i} className="border-b border-border/10 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2 font-mono text-muted-foreground">{i + 1}</td>
                <td className="px-4 py-2 font-medium">
                  <span className="text-muted-foreground">{r?.marca_norm ?? ''}</span>{' '}
                  {r?.modelo_norm ?? ''}
                </td>
                <td className="px-4 py-2 text-right font-mono font-bold">{formatBR(Number(r?.qtd_vendidos ?? 0))}</td>
                <td className="px-4 py-2 text-right font-mono">R$ {formatBR(Number(r?.ticket_medio ?? 0))}</td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Sem dados</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Data Transformations ---
function prepareEvoSeries(serie: any[], key: string) {
  const byDate: Record<string, any> = {};
  for (const row of (serie ?? [])) {
    const d = formatDate(row?.data_referencia);
    if (!byDate[d]) byDate[d] = { date: d };
    byDate[d][row?.fornecedora ?? 'X'] = Number(row?.[key] ?? 0);
  }
  return Object.values(byDate);
}

function prepareBrandSeries(marcas: any[], forn: string) {
  const filtered = (marcas ?? []).filter((r: any) => r?.fornecedora === forn);
  const allBrands = [...new Set(filtered.map((r: any) => r?.marca ?? ''))];

  // Get totals per date
  const dateTotals: Record<string, number> = {};
  for (const r of filtered) {
    const d = formatDate(r?.data_referencia);
    dateTotals[d] = (dateTotals[d] ?? 0) + Number(r?.qtd ?? 0);
  }

  const byDate: Record<string, any> = {};
  for (const r of filtered) {
    const d = formatDate(r?.data_referencia);
    if (!byDate[d]) byDate[d] = { date: d };
    const total = dateTotals[d] ?? 1;
    byDate[d][r?.marca ?? ''] = Math.round((Number(r?.qtd ?? 0) / total) * 1000) / 10;
  }

  return { data: Object.values(byDate), keys: allBrands };
}
