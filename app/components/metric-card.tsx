'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: number;
  color?: 'orange' | 'blue' | 'green' | 'default';
  className?: string;
}

export function MetricCard({ label, value, subtitle, icon, trend, color = 'default', className }: MetricCardProps) {
  const colorMap = {
    orange: 'border-l-orange-500',
    blue: 'border-l-blue-500',
    green: 'border-l-emerald-500',
    default: 'border-l-primary',
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-border/50 bg-card p-4 shadow-sm transition-all hover:shadow-md border-l-[3px]',
        colorMap[color] ?? colorMap.default,
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight font-mono">
            {value}
          </p>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {icon && <div className="text-muted-foreground">{icon}</div>}
          {trend !== undefined && trend !== null && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                trend > 0
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : trend < 0
                  ? 'bg-red-500/10 text-red-400'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {trend > 0 ? '+' : ''}{trend?.toFixed?.(1) ?? '0'}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
