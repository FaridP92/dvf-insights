import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Cadence de rafraîchissement du monitoring : assez court pour rester vivant,
 * assez long pour ne pas marteler la base.
 */
export const AUTO_REFRESH_SECONDS = 30;

export interface AutoRefresh {
  /** Secondes restantes avant le prochain rafraîchissement. */
  readonly secondsLeft: number;
  readonly paused: boolean;
  /** Bascule pause / lecture ; la reprise repart d'un cycle complet. */
  readonly toggle: () => void;
}

/**
 * Compte à rebours de rafraîchissement automatique.
 *
 * Le callback est lu dans une ref, jamais pendant le rendu : changer d'identité de fonction
 * à chaque rendu ne relance donc pas l'intervalle et le décompte reste régulier. Le compteur
 * lui-même vit dans une ref pour que le tick n'ait pas besoin d'un état à jour, l'état ne
 * servant qu'à l'affichage. L'intervalle est nettoyé au démontage comme à chaque bascule.
 */
export function useAutoRefresh(
  onRefresh: () => void,
  intervalSeconds: number = AUTO_REFRESH_SECONDS,
): AutoRefresh {
  const [paused, setPaused] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(intervalSeconds);
  const callbackRef = useRef(onRefresh);
  const leftRef = useRef(intervalSeconds);

  useEffect(() => {
    callbackRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (paused) return undefined;

    const id = setInterval(() => {
      leftRef.current -= 1;
      if (leftRef.current <= 0) {
        leftRef.current = intervalSeconds;
        callbackRef.current();
      }
      setSecondsLeft(leftRef.current);
    }, 1000);

    return () => clearInterval(id);
  }, [paused, intervalSeconds]);

  const toggle = useCallback(() => {
    // La reprise redonne un cycle entier plutôt que les quelques secondes qui restaient.
    if (paused) {
      leftRef.current = intervalSeconds;
      setSecondsLeft(intervalSeconds);
    }
    setPaused(!paused);
  }, [paused, intervalSeconds]);

  return { secondsLeft, paused, toggle };
}
