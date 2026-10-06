'use client';

import { Search, BarChart3 } from 'lucide-react';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Search className="h-4 w-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-none tracking-tight">
              Seminovos X-Ray
            </span>
            <span className="text-[10px] text-muted-foreground leading-none mt-0.5">
              LOCALIZA × MOVIDA
            </span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Dados ao vivo</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </div>
    </header>
  );
}
