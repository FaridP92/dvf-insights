import { lazy, type ComponentType } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layout/AppShell';

const RELOAD_FLAG = 'dvf-chunk-reload';

/**
 * Chargement paresseux résilient aux déploiements : si un chunk référencé par un index.html
 * périmé n'existe plus, on recharge la page une fois pour récupérer le nouvel index.
 */
function lazyPage<T extends ComponentType>(loader: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const page = await loader();
      sessionStorage.removeItem(RELOAD_FLAG);
      return page;
    } catch (error) {
      if (sessionStorage.getItem(RELOAD_FLAG) === null) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
      }
      throw error;
    }
  });
}

const OverviewPage = lazyPage(() => import('@/features/overview/OverviewPage'));
const ExplorerPage = lazyPage(() => import('@/features/explorer/ExplorerPage'));
const PredictionsPage = lazyPage(() => import('@/features/predictions/PredictionsPage'));
const PipelinesPage = lazyPage(() => import('@/features/pipelines/PipelinesPage'));

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'explorer', element: <ExplorerPage /> },
      { path: 'predictions', element: <PredictionsPage /> },
      { path: 'pipelines', element: <PipelinesPage /> },
    ],
  },
]);
