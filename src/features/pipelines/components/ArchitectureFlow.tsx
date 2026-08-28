import { Fragment } from 'react';
import {
  ArrowRight,
  Database,
  FileSpreadsheet,
  MonitorCheck,
  Workflow,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/shared/ui';
import type { ArchitectureStatuses, StageId } from '../lib/pipelineMetrics';

interface Stage {
  readonly id: StageId;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
}

/** Les cinq maillons de la chaîne, du fichier public à l'écran. */
const STAGES: readonly Stage[] = [
  {
    id: 'source',
    icon: FileSpreadsheet,
    title: 'data.gouv.fr',
    description: 'CSV DVF publiés par la DGFiP, environ 3,5 M de lignes par an.',
  },
  {
    id: 'n8n',
    icon: Workflow,
    title: 'n8n',
    description: "Workflow d'ingestion planifié, déclenchement par webhook.",
  },
  {
    id: 'edge',
    icon: Zap,
    title: 'Edge Function ingest-dvf',
    description: 'Validation Zod du lot, puis upsert idempotent par lots de 5 000.',
  },
  {
    id: 'postgres',
    icon: Database,
    title: 'PostgreSQL',
    description: 'dvf_mutations, dvf_mutations_clean, puis vues matérialisées.',
  },
  {
    id: 'front',
    icon: MonitorCheck,
    title: 'Front React',
    description: 'Build Vite servi par Vercel, lecture seule via PostgREST.',
  },
];

/** Flèche animée : pointillés qui défilent dans le sens du flux. */
function FlowArrow() {
  return (
    <li aria-hidden className="flex shrink-0 items-center justify-center py-1 xl:py-0">
      <span className="flex rotate-90 items-center gap-1 xl:rotate-0">
        <span className="pipeline-arrow h-0.5 w-8 rounded-full" />
        <ArrowRight className="size-3.5 text-fg-subtle" />
      </span>
    </li>
  );
}

export function ArchitectureFlow({ states }: { readonly states: ArchitectureStatuses }) {
  return (
    <>
      <style>{`
@keyframes pipeline-flow { from { background-position: 0 0; } to { background-position: 16px 0; } }
.pipeline-arrow {
  background-image: linear-gradient(90deg, var(--color-border-strong) 0 8px, transparent 8px 16px);
  background-size: 16px 2px;
  background-repeat: repeat-x;
  animation: pipeline-flow 1.1s linear infinite;
}
@media (prefers-reduced-motion: reduce) { .pipeline-arrow { animation: none; } }
      `}</style>
      <ol className="flex flex-col items-stretch xl:flex-row xl:items-center">
        {STAGES.map((stage, index) => {
          const state = states[stage.id];
          const Icon = stage.icon;
          return (
            <Fragment key={stage.id}>
              {index > 0 && <FlowArrow />}
              <li className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border bg-surface-2/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon className="size-4 shrink-0 text-fg-muted" aria-hidden />
                    <span className="truncate font-mono text-xs font-medium text-fg">
                      {stage.title}
                    </span>
                  </span>
                  <Badge tone={state.tone}>{state.label}</Badge>
                </div>
                <p className="text-xs leading-relaxed text-fg-muted">{stage.description}</p>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </>
  );
}
