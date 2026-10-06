'use client';

import { type ReactNode } from 'react';

interface SectionHeaderProps {
  icon?: ReactNode;
  badge?: string;
  title: string;
  subtitle?: string;
}

export function SectionHeader({ icon, badge, title, subtitle }: SectionHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        {badge && (
          <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
            {badge}
          </span>
        )}
        <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
          {icon}
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="text-sm text-muted-foreground max-w-3xl">{subtitle}</p>
      )}
      <div className="mt-3 h-px bg-gradient-to-r from-primary/30 via-border to-transparent" />
    </div>
  );
}
