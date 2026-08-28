import { NavLink } from 'react-router-dom';
import { Database, Code2 } from 'lucide-react';
import { APP_ROUTES } from '@/app/routes';
import { dataSource } from '@/shared/api/supabase';
import { Badge, cn } from '@/shared/ui';

export const GITHUB_URL = 'https://github.com/FaridP92/dvf-insights';

export function Sidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface/60 lg:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid size-8 place-items-center rounded-lg bg-accent-soft text-accent">
          <Database className="size-4" aria-hidden />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-fg">DVF Insights</p>
          <p className="text-[11px] text-fg-subtle">Marché immobilier · open data</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3" aria-label="Navigation principale">
        {APP_ROUTES.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              cn(
                'focus-ring flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-surface-2 font-medium text-fg'
                  : 'text-fg-muted hover:bg-surface-2/60 hover:text-fg',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn('size-4', isActive ? 'text-accent' : 'text-fg-subtle')} aria-hidden />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-3 border-t border-border p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wide text-fg-subtle">Source</span>
          <Badge tone={dataSource === 'supabase' ? 'accent' : 'info'} pulse={dataSource === 'supabase'}>
            {dataSource === 'supabase' ? 'Supabase live' : 'Mock typé'}
          </Badge>
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="focus-ring flex items-center gap-2 rounded-md text-xs text-fg-muted hover:text-fg"
        >
          <Code2 className="size-3.5" aria-hidden />
          Code source
        </a>
      </div>
    </aside>
  );
}
