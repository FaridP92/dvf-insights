/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 *
 * Toute la donnée de démonstration doit être reproductible : deux exécutions avec la même
 * graine produisent exactement les mêmes jeux. C'est ce qui permet de tester les mocks,
 * de comparer deux captures d'écran et d'éviter qu'un graphique change à chaque rechargement.
 *
 * mulberry32 tient en quelques lignes, passe les tests statistiques usuels pour un usage
 * de simulation, et n'a aucune dépendance : suffisant ici, jamais utilisé pour du cryptographique.
 */
export interface Rng {
  /** Flottant uniforme dans [0, 1). */
  next(): number;
  /** Flottant uniforme dans [min, max). */
  range(min: number, max: number): number;
  /** Entier uniforme dans [min, max], bornes incluses. */
  int(min: number, max: number): number;
  /** Tirage gaussien (Box-Muller) de moyenne et d'écart-type donnés. */
  normal(mean: number, sd: number): number;
  /** Élément tiré uniformément dans un tableau non vide. */
  pick<T>(arr: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min: number, max: number): number => min + next() * (max - min);

  const int = (min: number, max: number): number => {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    if (high < low) return low;
    return low + Math.floor(next() * (high - low + 1));
  };

  const normal = (mean: number, sd: number): number => {
    // Box-Muller : u1 borné loin de zéro pour éviter log(0) = -Infinity.
    const u1 = Math.max(next(), Number.EPSILON);
    const u2 = next();
    return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const pick = <T>(arr: readonly T[]): T => {
    const value = arr[Math.floor(next() * arr.length)];
    if (value === undefined)
      throw new Error('createRng.pick : tableau vide ou trou dans le tableau');
    return value;
  };

  return { next, range, int, normal, pick };
}

/** Borne une valeur dans un intervalle. Utilitaire partagé par les générateurs de mocks. */
export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Arrondi à n décimales, pour garder des jeux de données lisibles et stables. */
export const round = (value: number, decimals = 0): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
