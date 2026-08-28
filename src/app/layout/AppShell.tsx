import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { APP_ROUTES } from '@/app/routes';
import { ErrorBoundary, ChartSkeleton } from '@/shared/ui';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';

export function AppShell() {
  const { pathname } = useLocation();
  const current = APP_ROUTES.find((r) => r.path === pathname);

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-4 backdrop-blur md:px-8">
          <p className="text-sm text-fg-muted">
            <span className="text-fg-subtle">DVF Insights / </span>
            <span className="text-fg">{current?.label ?? 'Page'}</span>
          </p>
          <p className="hidden text-xs text-fg-subtle md:block">
            Données DVF · data.gouv.fr · mise à jour mensuelle
          </p>
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 lg:pb-8">
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<ChartSkeleton height={400} />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
