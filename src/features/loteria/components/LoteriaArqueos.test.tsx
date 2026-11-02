import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultLotteryCampaign, type LotteryCampaign } from '../domain/loteria';
import { LoteriaArqueos } from './LoteriaArqueos';

describe('arqueos de Lotería: UI crítica', () => {
  it('no permite guardar un arqueo sin responsable o con borrador pendiente', () => {
    const onSave = vi.fn(async (_next: LotteryCampaign, _message: string) => true);
    const { rerender } = render(<LoteriaArqueos campaign={createDefaultLotteryCampaign(2026)} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText('Nombre de la persona responsable'), { target: { value: 'Operador' } });
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '0,00' } });
    expect(screen.getByRole('button', { name: 'Guardar arqueo' })).toBeEnabled();
    rerender(<LoteriaArqueos campaign={createDefaultLotteryCampaign(2026)} onSave={onSave} blocked />);
    expect(screen.getByRole('button', { name: 'Guardar arqueo' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Guarda los cambios pendientes');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('solo confirma el cierre si el guardado SQLite se acepta', async () => {
    const onSave = vi.fn(async (_next: LotteryCampaign, _message: string) => false);
    render(<LoteriaArqueos campaign={createDefaultLotteryCampaign(2026)} onSave={onSave} />);
    fireEvent.change(screen.getByPlaceholderText('Nombre de la persona responsable'), { target: { value: 'Técnico RRLL' } });
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '0,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar arqueo' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0][0].cashArqueos?.[0]?.recordedBy).toBe('Técnico RRLL');
    expect(screen.getByPlaceholderText('0,00')).toHaveValue('0,00');
    await screen.findByText(/No se ha podido guardar el arqueo/);
  });
});
