'use client';

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, ScatterChart, Scatter, ZAxis,
  AreaChart, Area,
} from 'recharts';

const COLORS = {
  localiza: '#E85D04',
  movida: '#2563EB',
  green: '#10B981',
  pink: '#EC4899',
  purple: '#8B5CF6',
  yellow: '#F59E0B',
  cyan: '#06B6D4',
  red: '#EF4444',
};

const BRAND_COLORS = [
  '#E85D04', '#2563EB', '#10B981', '#EC4899',
  '#8B5CF6', '#F59E0B', '#06B6D4', '#EF4444',
];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'hsl(220, 15%, 13%)',
    border: '1px solid hsl(220, 13%, 22%)',
    borderRadius: '8px',
    fontSize: 11,
    color: '#e5e5e5',
  },
};

function formatBR(v: number | undefined | null): string {
  if (v === null || v === undefined) return '0';
  return Number(v).toLocaleString('pt-BR');
}

function formatK(v: number | undefined | null): string {
  if (v === null || v === undefined) return '0';
  const n = Number(v);
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

function formatDate(d: string | undefined | null): string {
  if (!d) return '';
  const parts = String(d).split('T')[0]?.split('-') ?? [];
  return parts.length >= 3 ? `${parts[2]}/${parts[1]}` : String(d);
}

// ---- Evolution Line Chart ----
interface EvoLineProps {
  data: any[];
  dataKeyL: string;
  dataKeyM: string;
  yLabel: string;
  yFormatter?: (v: number) => string;
  height?: number;
}

export function EvoLineChart({ data, dataKeyL, dataKeyM, yLabel, yFormatter, height = 300 }: EvoLineProps) {
  const fmt = yFormatter ?? formatBR;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data ?? []} margin={{ top: 5, right: 15, left: 15, bottom: 20 }}>
        <XAxis
          dataKey="date"
          tickLine={false}
          tick={{ fontSize: 10, fill: '#888' }}
          interval="preserveStartEnd"
          label={{ value: '', position: 'insideBottom', offset: -15, style: { fontSize: 11 } }}
        />
        <YAxis
          tickLine={false}
          tick={{ fontSize: 10, fill: '#888' }}
          tickFormatter={(v: number) => formatK(v)}
          label={{ value: yLabel, angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11, fill: '#888' } }}
          width={55}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: any) => [fmt(v), '']}
          labelFormatter={(l: any) => `Data: ${l}`}
        />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
        <Line
          type="monotone"
          dataKey={dataKeyL}
          name="Localiza"
          stroke={COLORS.localiza}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey={dataKeyM}
          name="Movida"
          stroke={COLORS.movida}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ---- Stacked Area Chart for brands ----
interface StackedAreaProps {
  data: any[];
  keys: string[];
  height?: number;
  title?: string;
}

export function StackedAreaChart({ data, keys, height = 280, title }: StackedAreaProps) {
  return (
    <div>
      {title && <p className="text-xs font-medium text-muted-foreground mb-2">{title}</p>}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data ?? []} margin={{ top: 5, right: 15, left: 15, bottom: 20 }}>
          <XAxis
            dataKey="date"
            tickLine={false}
            tick={{ fontSize: 10, fill: '#888' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickLine={false}
            tick={{ fontSize: 10, fill: '#888' }}
            tickFormatter={(v: number) => `${v}%`}
            width={40}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(v: any) => [`${Number(v)?.toFixed?.(1) ?? '0'}%`, '']}
          />
          <Legend verticalAlign="top" wrapperStyle={{ fontSize: 10 }} />
          {(keys ?? []).map((k: string, i: number) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stackId="1"
              fill={BRAND_COLORS[i % BRAND_COLORS.length]}
              stroke={BRAND_COLORS[i % BRAND_COLORS.length]}
              fillOpacity={0.7}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---- Horizontal Bar Chart ----
interface HBarProps {
  data: any[];
  height?: number;
  color?: string;
  valueKey?: string;
  nameKey?: string;
  formatter?: (v: number) => string;
}

export function HBarChart({ data, height = 300, color = COLORS.localiza, valueKey = 'qtd', nameKey = 'name', formatter }: HBarProps) {
  const fmt = formatter ?? formatBR;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data ?? []}
        layout="vertical"
        margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
      >
        <XAxis
          type="number"
          tickLine={false}
          tick={{ fontSize: 10, fill: '#888' }}
          tickFormatter={(v: number) => formatK(v)}
        />
        <YAxis
          type="category"
          dataKey={nameKey}
          tickLine={false}
          tick={{ fontSize: 10, fill: '#ccc' }}
          width={80}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: any) => [fmt(v), '']}
        />
        <Bar dataKey={valueKey} fill={color} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Vertical Bar Chart ----
interface VBarProps {
  data: any[];
  height?: number;
  color?: string;
  valueKey?: string;
  nameKey?: string;
}

export function VBarChart({ data, height = 280, color = COLORS.localiza, valueKey = 'qtd', nameKey = 'name' }: VBarProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data ?? []} margin={{ top: 5, right: 15, left: 15, bottom: 20 }}>
        <XAxis
          dataKey={nameKey}
          tickLine={false}
          tick={{ fontSize: 10, fill: '#888' }}
        />
        <YAxis
          tickLine={false}
          tick={{ fontSize: 10, fill: '#888' }}
          tickFormatter={(v: number) => formatK(v)}
          width={45}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: any) => [formatBR(v), '']}
        />
        <Bar dataKey={valueKey} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---- Scatter Chart ----
interface ScatterProps {
  data: any[];
  height?: number;
}

export function PriceKmScatter({ data, height = 350 }: ScatterProps) {
  const locData = (data ?? []).filter((d: any) => d?.fornecedora === 'LOCALIZA');
  const movData = (data ?? []).filter((d: any) => d?.fornecedora === 'MOVIDA');

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 10, right: 15, left: 15, bottom: 25 }}>
        <XAxis
          dataKey="km"
          type="number"
          name="km"
          tickLine={false}
          tick={{ fontSize: 10, fill: '#888' }}
          tickFormatter={(v: number) => formatK(v)}
          label={{ value: 'Quilometragem', position: 'insideBottom', offset: -15, style: { fontSize: 11, fill: '#888' } }}
        />
        <YAxis
          dataKey="preco"
          type="number"
          name="Preço"
          tickLine={false}
          tick={{ fontSize: 10, fill: '#888' }}
          tickFormatter={(v: number) => `R$${formatK(v)}`}
          label={{ value: 'Preço (R$)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11, fill: '#888' } }}
          width={65}
        />
        <ZAxis range={[15, 15]} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: any, name: any) => {
            if (name === 'km') return [`${formatBR(v)} km`, 'Km'];
            return [`R$ ${formatBR(v)}`, 'Preço'];
          }}
        />
        <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} />
        <Scatter name="Localiza" data={locData} fill={COLORS.localiza} fillOpacity={0.5} />
        <Scatter name="Movida" data={movData} fill={COLORS.movida} fillOpacity={0.5} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ---- Premium/Discount Bar ----
interface PremiumBarProps {
  data: any[];
  height?: number;
}

export function PremiumBar({ data, height = 300 }: PremiumBarProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data ?? []} margin={{ top: 5, right: 15, left: 15, bottom: 25 }}>
        <XAxis
          dataKey="modelo"
          tickLine={false}
          tick={{ fontSize: 9, fill: '#888' }}
          angle={-45}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tickLine={false}
          tick={{ fontSize: 10, fill: '#888' }}
          tickFormatter={(v: number) => `${v}%`}
          width={45}
          label={{ value: 'vs FIPE (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fontSize: 11, fill: '#888' } }}
        />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: any) => [`${Number(v)?.toFixed?.(1) ?? '0'}%`, 'vs FIPE']}
        />
        <Bar
          dataKey="premio_pct"
          name="vs FIPE"
          fill={COLORS.localiza}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export { COLORS, BRAND_COLORS, formatBR, formatK, formatDate };
