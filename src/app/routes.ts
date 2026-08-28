import { Activity, BarChart3, LayoutDashboard, Sparkles, type LucideIcon } from 'lucide-react';

export interface AppRoute {
  readonly path: string;
  readonly label: string;
  readonly short: string;
  readonly icon: LucideIcon;
}

export const APP_ROUTES: readonly AppRoute[] = [
  { path: '/', label: "Vue d'ensemble", short: 'Dashboard', icon: LayoutDashboard },
  { path: '/explorer', label: 'Explorateur & Analytics', short: 'Explorer', icon: BarChart3 },
  { path: '/predictions', label: 'Prédictions IA & Tendances', short: 'Prédictions', icon: Sparkles },
  { path: '/pipelines', label: 'Data Pipelines', short: 'Pipelines', icon: Activity },
];
