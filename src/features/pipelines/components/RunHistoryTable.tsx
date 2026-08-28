import { useMemo, useState } from 'react';
import { formatDateTime, formatDuration, formatInt } from '@/lib/format';
import { Badge, EmptyState, Segmented } from '@/shared/ui';
import type { PipelineRun } from '@/shared/types/dvf';
import { statusLabel, statusTone } from '../lib/pipelineMetrics';

type RunFilter = 'all' | 'success' | 'failed';

const FILTERS: ReadonlyArray<{ readonly value: RunFilter; readonly label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'success', label: 'Succès' },
  { value: 'failed', label: 'Échecs' },
];

/** Longueur au-delà de laquelle le message d'erreur est coupé ; l'intégral reste en title. */
const ERROR_MAX_CHARS = 64;

const truncate = (message: string): string =>
  message.length <= ERROR_MAX_CHARS ? message : `${message.slice(0, ERROR_MAX_CHARS - 1)}…`;

export function RunHistoryTable({ runs }: { readonly runs: readonly PipelineRun[] }) {
  const [filter, setFilter] = useState<RunFilter>('all');

  const visible = useMemo(() => {
    if (filter === 'all') return runs;
    return runs.filter((run) => run.status === filter);
  }, [runs, filter]);

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={filter}
        onChange={setFilter}
        options={FILTERS}
        ariaLabel="Filtrer les exécutions par statut"
        className="self-start"
      />

      {visible.length === 0 ? (
        <EmptyState message="Aucune exécution pour ce filtre." />
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[52rem] border-collapse text-sm">
            <caption className="sr-only">
              Historique des exécutions du pipeline d ingestion DVF
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-fg-subtle">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Statut
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Workflow
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Démarré
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Durée
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Ingérées
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  Rejetées
                </th>
                <th scope="col" className="py-2 font-medium">
                  Message
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((run) => (
                <tr key={run.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3">
                    <Badge tone={statusTone(run.status)} pulse={run.status === 'running'}>
                      {statusLabel(run.status)}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-fg">{run.workflowName}</td>
                  <td className="tabular py-2 pr-3 text-xs text-fg-muted">
                    {formatDateTime(run.startedAt)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right text-xs text-fg-muted">
                    {run.durationMs === null ? 'en cours' : formatDuration(run.durationMs)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right text-xs text-fg">
                    {formatInt(run.rowsIngested)}
                  </td>
                  <td className="tabular py-2 pr-3 text-right text-xs text-fg-muted">
                    {run.rowsRejected === 0 ? '-' : formatInt(run.rowsRejected)}
                  </td>
                  <td className="max-w-xs py-2 text-xs text-danger">
                    {run.errorMessage === null ? (
                      <span className="text-fg-subtle">-</span>
                    ) : (
                      <span title={run.errorMessage} className="block truncate font-mono">
                        {truncate(run.errorMessage)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
