/**
 * Types du domaine DVF. Ils sont partagés par les mocks et par les vues Supabase :
 * une seule source de vérité pour la forme des données.
 */
export type PropertyType = 'appartement' | 'maison';

export type Department = {
  readonly code: string;
  readonly name: string;
  /** Région administrative, base de la comparaison territoriale à l'échelle nationale. */
  readonly region: string;
};

/** Ligne du référentiel `communes` : une commune DVF et sa position. */
export interface Commune {
  readonly inseeCode: string;
  readonly name: string;
  readonly departmentCode: string;
  readonly lat: number;
  readonly lng: number;
}

/** Ligne de la table d'agrégats monthly_stats. */
export interface MonthlyStat {
  readonly month: string; // ISO "YYYY-MM"
  readonly departmentCode: string;
  readonly propertyType: PropertyType;
  readonly transactions: number;
  readonly medianPricePerSqm: number;
  readonly p10PricePerSqm: number;
  readonly p90PricePerSqm: number;
  readonly medianSurface: number;
  readonly totalValue: number;
}

/** Ligne de la table d'agrégats commune_stats (12 mois glissants). */
export interface CommuneStat {
  readonly inseeCode: string;
  readonly communeName: string;
  readonly departmentCode: string;
  readonly propertyType: PropertyType;
  readonly transactions: number;
  readonly medianPricePerSqm: number;
  readonly yoyChange: number; // variation N-1 en fraction (0.042 = +4,2 %)
  readonly tensionIndex: number; // 0 à 10
  readonly lat: number;
  readonly lng: number;
}

/** Mutation nettoyée (échantillon) utilisée par l'explorateur et la détection d'anomalies. */
export interface Transaction {
  readonly id: string;
  readonly date: string; // ISO date
  readonly inseeCode: string;
  readonly communeName: string;
  readonly departmentCode: string;
  readonly propertyType: PropertyType;
  readonly price: number;
  readonly surface: number;
  readonly rooms: number;
  readonly landSurface: number;
  readonly pricePerSqm: number;
}

export type PipelineStatus = 'success' | 'running' | 'failed' | 'queued';

export interface PipelineRun {
  readonly id: string;
  readonly workflowName: string;
  readonly status: PipelineStatus;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly rowsIngested: number;
  readonly rowsRejected: number;
  readonly durationMs: number | null;
  readonly errorMessage: string | null;
}

export interface WebhookEvent {
  readonly id: string;
  readonly source: string;
  readonly receivedAt: string;
  readonly statusCode: number;
  readonly latencyMs: number;
  readonly payloadBytes: number;
}

export interface DatabaseHealth {
  readonly checkedAt: string;
  readonly activeConnections: number;
  readonly maxConnections: number;
  readonly cacheHitRatio: number; // 0 à 1
  readonly dbSizeBytes: number;
  readonly rawRows: number;
  readonly cleanRows: number;
  readonly lastRefreshAt: string;
  readonly replicationLagMs: number;
}
