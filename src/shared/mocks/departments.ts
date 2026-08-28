import type { Department, PropertyType } from '@/shared/types/dvf';

/**
 * Profil de département utilisé par tous les générateurs de mocks.
 *
 * Les niveaux de prix sont des ordres de grandeur observés en 2025 sur les données DVF
 * et les baromètres notariaux. Ils ne servent pas à estimer un bien réel : ils servent à
 * produire une démonstration crédible, où Paris coûte trois fois le Nord et où les maisons
 * se négocient sous les appartements partout sauf à Paris, comme dans la réalité.
 */
export interface DepartmentProfile extends Department {
  readonly region: string;
  /** Parc de logements (INSEE, ordre de grandeur). Sert à dimensionner les volumes. */
  readonly housingStock: number;
  /** Prix médian de référence en euros par m², par type de bien. */
  readonly basePricePerSqm: Readonly<Record<PropertyType, number>>;
  /** Part des appartements dans les transactions : dominante en zone dense, minoritaire ailleurs. */
  readonly apartmentShare: number;
  /** Tendance annuelle propre au département, en fraction (-0,035 = -3,5 % par an). */
  readonly annualTrend: number;
}

export const PARIS_CODE = '75';

export const DEPARTMENTS: readonly DepartmentProfile[] = [
  {
    code: PARIS_CODE,
    name: 'Paris',
    region: 'Île-de-France',
    housingStock: 1_400_000,
    basePricePerSqm: { appartement: 9800, maison: 11_200 },
    apartmentShare: 0.95,
    annualTrend: -0.035,
  },
  {
    code: '92',
    name: 'Hauts-de-Seine',
    region: 'Île-de-France',
    housingStock: 830_000,
    basePricePerSqm: { appartement: 7200, maison: 5760 },
    apartmentShare: 0.85,
    annualTrend: -0.021,
  },
  {
    code: '69',
    name: 'Rhône',
    region: 'Auvergne-Rhône-Alpes',
    housingStock: 950_000,
    basePricePerSqm: { appartement: 4600, maison: 3310 },
    apartmentShare: 0.7,
    annualTrend: -0.028,
  },
  {
    code: '33',
    name: 'Gironde',
    region: 'Nouvelle-Aquitaine',
    housingStock: 850_000,
    basePricePerSqm: { appartement: 4300, maison: 3350 },
    apartmentShare: 0.45,
    annualTrend: -0.012,
  },
  {
    code: '13',
    name: 'Bouches-du-Rhône',
    region: "Provence-Alpes-Côte d'Azur",
    housingStock: 1_070_000,
    basePricePerSqm: { appartement: 3400, maison: 2550 },
    apartmentShare: 0.62,
    annualTrend: 0.018,
  },
  {
    code: '31',
    name: 'Haute-Garonne',
    region: 'Occitanie',
    housingStock: 720_000,
    basePricePerSqm: { appartement: 3500, maison: 2590 },
    apartmentShare: 0.52,
    annualTrend: 0.006,
  },
  {
    code: '44',
    name: 'Loire-Atlantique',
    region: 'Pays de la Loire',
    housingStock: 750_000,
    basePricePerSqm: { appartement: 3900, maison: 2960 },
    apartmentShare: 0.45,
    annualTrend: -0.016,
  },
  {
    code: '59',
    name: 'Nord',
    region: 'Hauts-de-France',
    housingStock: 1_200_000,
    basePricePerSqm: { appartement: 2500, maison: 1750 },
    apartmentShare: 0.38,
    annualTrend: 0.011,
  },
  {
    code: '06',
    name: 'Alpes-Maritimes',
    region: "Provence-Alpes-Côte d'Azur",
    housingStock: 800_000,
    basePricePerSqm: { appartement: 5200, maison: 4160 },
    apartmentShare: 0.72,
    annualTrend: 0.031,
  },
  {
    code: '35',
    name: 'Ille-et-Vilaine',
    region: 'Bretagne',
    housingStock: 550_000,
    basePricePerSqm: { appartement: 3700, maison: 2660 },
    apartmentShare: 0.42,
    annualTrend: -0.008,
  },
  {
    code: '38',
    name: 'Isère',
    region: 'Auvergne-Rhône-Alpes',
    housingStock: 680_000,
    basePricePerSqm: { appartement: 2900, maison: 2600 },
    apartmentShare: 0.55,
    annualTrend: 0.014,
  },
  {
    code: '34',
    name: 'Hérault',
    region: 'Occitanie',
    housingStock: 700_000,
    basePricePerSqm: { appartement: 3300, maison: 2510 },
    apartmentShare: 0.58,
    annualTrend: 0.042,
  },
];

export const PROPERTY_TYPES: readonly PropertyType[] = ['appartement', 'maison'];

/** Surface médiane de référence, par type de bien. Base des tirages de surface. */
export const REFERENCE_SURFACE: Readonly<Record<PropertyType, number>> = {
  appartement: 55,
  maison: 105,
};

export function findDepartment(code: string): DepartmentProfile | undefined {
  return DEPARTMENTS.find((d) => d.code === code);
}
