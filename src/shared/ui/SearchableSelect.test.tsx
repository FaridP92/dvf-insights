import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SearchableSelect } from './SearchableSelect';

/** 97 départements en live : c'est ce seuil qui fait basculer le contrôle en combobox. */
const many = Array.from({ length: 30 }, (_, index) => ({
  value: String(index).padStart(2, '0'),
  label: index === 0 ? '34 · Hérault' : `Département ${index}`,
}));

const few = [
  { value: '75', label: '75 · Paris' },
  { value: '69', label: '69 · Rhône' },
];

describe('SearchableSelect', () => {
  it('reste une liste native tant que les options sont peu nombreuses', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect value="75" onChange={onChange} options={few} ariaLabel="Département" />,
    );

    const select = screen.getByLabelText('Département');
    expect(select.tagName).toBe('SELECT');
    fireEvent.change(select, { target: { value: '69' } });
    expect(onChange).toHaveBeenCalledWith('69');
  });

  it('bascule en combobox au-delà du seuil et filtre sans tenir compte des accents', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect value="00" onChange={onChange} options={many} ariaLabel="Département" />,
    );

    const input = screen.getByRole('combobox', { name: 'Département' });
    expect(input).toHaveValue('34 · Hérault');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    fireEvent.focus(input);
    expect(screen.getAllByRole('option')).toHaveLength(30);

    fireEvent.change(input, { target: { value: 'herault' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('34 · Hérault');

    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  });

  it('sélectionne à la souris et referme la liste', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect value="00" onChange={onChange} options={many} ariaLabel="Département" />,
    );

    const input = screen.getByRole('combobox', { name: 'Département' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Département 7' } });
    fireEvent.mouseDown(screen.getByText('Département 7'));

    expect(onChange).toHaveBeenCalledWith('07');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('se pilote au clavier : flèches, entrée et échappement', () => {
    const onChange = vi.fn();
    render(
      <SearchableSelect value="00" onChange={onChange} options={many} ariaLabel="Département" />,
    );

    const input = screen.getByRole('combobox', { name: 'Département' });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('02');

    fireEvent.focus(input);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
