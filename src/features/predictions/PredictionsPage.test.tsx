import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import PredictionsPage from './PredictionsPage';

/**
 * Test de fumée : la page monte, traverse ses états de chargement et rend les quatre
 * blocs sans lever. Les graphiques Recharts sont montés pour de vrai, ce qui vérifie
 * au passage que les séries et les axes acceptent la forme des points produite par le moteur.
 */
describe('PredictionsPage', () => {
  it('rend les quatre blocs une fois les données chargées', async () => {
    render(<PredictionsPage />);

    expect(screen.getByRole('heading', { name: 'Prédictions IA & Tendances' })).toBeInTheDocument();

    await waitFor(
      () => {
        expect(screen.getByLabelText('Commune du bien')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    expect(screen.getByLabelText('Surface en m²')).toBeInTheDocument();
    expect(screen.getByLabelText('Département de la prévision')).toBeInTheDocument();
    expect(screen.getByLabelText('Filtrer les anomalies')).toBeInTheDocument();
    expect(screen.getByText('Phases de marché par département')).toBeInTheDocument();

    // Les comparables arrivent après le référentiel : ils dépendent de la commune choisie.
    expect(
      await screen.findByText(/Modèle hédonique/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });
});
