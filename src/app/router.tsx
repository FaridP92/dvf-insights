import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './layout/AppShell';

const OverviewPage = lazy(() => import('@/features/overview/OverviewPage'));
const ExplorerPage = lazy(() => import('@/features/explorer/ExplorerPage'));
const PredictionsPage = lazy(() => import('@/features/predictions/PredictionsPage'));
const PipelinesPage = lazy(() => import('@/features/pipelines/PipelinesPage'));

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
