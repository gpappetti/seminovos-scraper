'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Activity, TrendingUp, PieChart, Scale, BookOpen,
  Menu, X, ChevronRight, ShoppingCart,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'pulso', label: 'Pulso do Mercado', icon: Activity },
  { id: 'vendidos', label: 'Veículos Vendidos', icon: ShoppingCart },
  { id: 'evolucao', label: 'Evolução Histórica', icon: TrendingUp },
  { id: 'mix', label: 'Mix da Frota', icon: PieChart },
  { id: 'fipe', label: 'Comparação FIPE', icon: Scale },
  { id: 'metodologia', label: 'Metodologia', icon: BookOpen },
];

interface SidebarNavProps {
  activeSection: string;
  onNavigate: (id: string) => void;
}

export function SidebarNav({ activeSection, onNavigate }: SidebarNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed top-3 right-3 z-[60] flex h-9 w-9 items-center justify-center rounded-md bg-card border border-border shadow-md lg:hidden"
        aria-label="Menu"
      >
        {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-14 z-50 h-[calc(100vh-3.5rem)] w-56 border-r border-border/50 bg-card/95 backdrop-blur-xl transition-transform duration-300',
          'lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <nav className="flex flex-col gap-1 p-3 pt-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Seções
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{item.label}</span>
                {active && <ChevronRight className="ml-auto h-3 w-3" />}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-0 right-0 px-4">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-[10px] font-medium text-muted-foreground">
              Dados atualizados diariamente às 16h (Brasília)
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
