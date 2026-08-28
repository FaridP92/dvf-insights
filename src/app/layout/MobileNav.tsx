import { NavLink } from 'react-router-dom';
import { APP_ROUTES } from '@/app/routes';
import { cn } from '@/shared/ui';

export function MobileNav() {
  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-surface/95 backdrop-blur lg:hidden"
    >
      {APP_ROUTES.map(({ path, short, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          end={path === '/'}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-1 py-2 text-[11px]',
              isActive ? 'text-accent' : 'text-fg-muted',
            )
          }
        >
          <Icon className="size-4" aria-hidden />
          {short}
        </NavLink>
      ))}
    </nav>
  );
}
