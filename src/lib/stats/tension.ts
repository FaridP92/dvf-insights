/**
 * Indice de tension immobilière, borné de 0 à 10.
 *
 * Trois composantes normalisées, pondérées :
 *  - momentum de volume (transactions 12 mois vs 12 mois précédents)      40 %
 *  - momentum de prix (médian au m² N vs N-1)                             40 %
 *  - vitesse de rotation (transactions / parc estimé, proxy de liquidité)  20 %
 *
 * Chaque composante est passée dans une sigmoïde centrée pour ramener les variations
 * courantes (-15 % à +15 %) sur la majeure partie de l'échelle.
 */
export interface TensionInputs {
  readonly volumeChange: number; // fraction
  readonly priceChange: number; // fraction
  readonly turnoverRate: number; // fraction du parc vendu par an (0.02 = 2 %)
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export function tensionIndex(input: TensionInputs): number {
  const volume = sigmoid(input.volumeChange / 0.08);
  const price = sigmoid(input.priceChange / 0.05);
  // 2 % de rotation annuelle est la référence "marché fluide" en France
  const turnover = sigmoid((input.turnoverRate - 0.02) / 0.01);
  const raw = 0.4 * volume + 0.4 * price + 0.2 * turnover;
  return Math.round(raw * 100) / 10;
}

export type TensionLabel = 'détendu' | 'équilibré' | 'tendu' | 'très tendu';

export function tensionLabel(index: number): TensionLabel {
  if (index < 3.5) return 'détendu';
  if (index < 5.5) return 'équilibré';
  if (index < 7.5) return 'tendu';
  return 'très tendu';
}
