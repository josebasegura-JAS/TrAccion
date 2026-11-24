import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_TELETRABAJO_DRAFT, type TeletrabajoSolicitud } from '../features/teletrabajo/domain/solicitud';
import { TeletrabajoEditor } from './TeletrabajoEditor';

const mocks = vi.hoisted(() => {
  const create = vi.fn(async () => ({ ok: false, message: 'Sin conexión' }));
  const update = vi.fn(async () => ({ ok: false, message: 'Conflicto de versión' }));
  const remove = vi.fn(async () => ({ ok: false, message: 'No se pudo eliminar' }));
  return {
    store: { createWithConcurrencyCheck: create, updateWithConcurrencyCheck: update, removeWithConcurrencyCheck: remove, solicitudes: [] as TeletrabajoSolicitud[] },
    employees: { employees: [], jobPositionTranslations: [] },
    config: { rutaPlantillaTeletrabajo: '' },
    lock: { status: 'acquired', isReadOnly: false, message: '' },
    create, update, remove, clear: vi.fn(), done: vi.fn(), close: vi.fn(),
    word: vi.fn(), download: vi.fn(),
  };
});
vi.mock('../features/teletrabajo/store/useTeletrabajoStore', () => ({ useTeletrabajoStore: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store) }));
vi.mock('../features/plantilla/store/useEmployeeStore', () => ({ useEmployeeStore: (selector: (state: typeof mocks.employees) => unknown) => selector(mocks.employees) }));
vi.mock('../features/configuracion/store/useConfiguracionStore', () => ({ useConfiguracionStore: (selector: (state: typeof mocks.config) => unknown) => selector(mocks.config) }));
vi.mock('../services/useSharedRecordLock', () => ({ useSharedRecordLock: () => mocks.lock }));
vi.mock('../hooks/useEditorShortcuts', () => ({ useEditorShortcuts: vi.fn() }));
vi.mock('../hooks/useUnsavedChanges', () => ({ useUnsavedChanges: () => ({ requestClose: mocks.close, dialogNode: null }) }));
vi.mock('../hooks/useRecoverableDraft', () => ({
  buildRecoverableDraftKey: (module: string, id: string) => module + ':' + id,
  useRecoverableDraft: () => ({ clearDraft: mocks.clear, dialogNode: null }),
}));
vi.mock('./ui/ModalShell', () => ({ ModalShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('./teletrabajo-editor/TeletrabajoEditorHeader', () => ({ TeletrabajoEditorHeader: () => null }));
vi.mock('./InlineSaveFeedback', () => ({ InlineSaveFeedback: () => null }));
vi.mock('../shared/audit/AuditHistoryButton', () => ({ AuditHistoryButton: () => null }));
vi.mock('../features/teletrabajo/domain/word', () => ({ generateTeletrabajoWord: mocks.word }));
vi.mock('../features/teletrabajo/domain/download', () => ({ saveDocxWithDialog: mocks.download }));

const solicitud: TeletrabajoSolicitud = {
  ...EMPTY_TELETRABAJO_DRAFT,
  id: 'sol-1', empleado: 'TEST', nombreApellidos: 'Persona de prueba',
  puestoNomina: 'Puesto', residencia: 'Residencia', dni: 'TEST-DNI', direccionTeletrabajo: 'Dirección',
  periodo: '2026-2027', diasTeletrabajo: ['martes'], fechaSolicitud: '2026-11-01',
  fechaOrdenador: '2026-09-01', fechaCascos: '2026-09-01',
  createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', deletedAt: null,
};
function editor(mode: 'create' | 'edit' = 'edit') {
  return render(<TeletrabajoEditor solicitud={mode === 'edit' ? solicitud : null} mode={mode} onDone={mocks.done} />);
}
function saveButton() { return screen.getByRole('button', { name: 'Guardar' }); }
function change(label: RegExp, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }); }
function fillNew() {
  change(/^Periodo/, '2026-2027');
  change(/^Empleado/, 'TEST');
  change(/^Nombre y apellidos/, 'Persona de prueba');
  change(/^Puesto nómina/, 'Puesto');
  change(/^Residencia/, 'Residencia');
  change(/^DNI/, 'TEST-DNI');
  change(/^Dirección teletrabajo/, 'Dirección');
  fireEvent.click(screen.getByRole('checkbox', { name: 'martes' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.store.solicitudes = [];
  Object.assign(mocks.lock, { status: 'acquired', isReadOnly: false, message: '' });
  mocks.create.mockResolvedValue({ ok: false, message: 'Sin conexión' });
  mocks.update.mockResolvedValue({ ok: false, message: 'Conflicto de versión' });
  mocks.remove.mockResolvedValue({ ok: false, message: 'No se pudo eliminar' });
});

describe('Teletrabajo: validaciones y seguridad del formulario', () => {
  it('impide el alta incompleta y exige al menos un día', () => {
    editor('create');
    expect(saveButton()).toBeDisabled();
    fillNew();
    expect(saveButton()).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'martes' }));
    expect(saveButton()).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('calcula las fechas de equipo sin sobrescribir una fecha manual', () => {
    editor('create');
    change(/^Periodo/, '2026-2027');
    expect(screen.getByLabelText(/^Fecha entrega ordenador/)).toHaveValue('2026-09-01');
    change(/^Fecha entrega ordenador/, '2026-10-15');
    change(/^Periodo/, '2027-2028');
    expect(screen.getByLabelText(/^Fecha entrega ordenador/)).toHaveValue('2026-10-15');
    expect(screen.getByLabelText(/^Fecha entrega cascos/)).toHaveValue('2027-09-01');
  });

  it('conserva los datos de alta si falla y solo limpia al confirmar un reintento', async () => {
    editor('create');
    fillNew();
    change(/^Observaciones$/, 'Conservar borrador');
    fireEvent.click(saveButton());
    await screen.findByText('Sin conexión');
    expect(screen.getByLabelText(/^Observaciones$/)).toHaveValue('Conservar borrador');
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.done).not.toHaveBeenCalled();
    mocks.create.mockResolvedValueOnce({ ok: true, message: '' });
    fireEvent.click(saveButton());
    await waitFor(() => expect(mocks.done).toHaveBeenCalledTimes(1));
    expect(mocks.clear).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it('exige motivo de desistimiento antes de guardar', () => {
    editor();
    change(/^Estado$/, 'desistida');
    expect(saveButton()).toBeDisabled();
    change(/^Observaciones RRLL/, '  ');
    expect(saveButton()).toBeDisabled();
    change(/^Observaciones RRLL/, 'Desistimiento comunicado');
    expect(saveButton()).toBeEnabled();
  });

  it('conserva las observaciones y el token original ante conflicto OCC', async () => {
    editor();
    change(/^Observaciones RRLL/, 'Nota pendiente');
    fireEvent.click(saveButton());
    await screen.findByText('Conflicto de versión');
    expect(mocks.update).toHaveBeenCalledWith(solicitud.id, expect.objectContaining({ observacionesRrll: 'Nota pendiente' }), solicitud.updatedAt);
    expect(screen.getByLabelText(/^Observaciones RRLL/)).toHaveValue('Nota pendiente');
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.done).not.toHaveBeenCalled();
  });

  it('bloquea guardados y eliminación sin reserva de edición', () => {
    Object.assign(mocks.lock, { status: 'locked', isReadOnly: true, message: 'Otro usuario está editando' });
    editor();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Generar Word' })).toBeDisabled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('no reemplaza cambios locales al recibir una versión externa en modo lectura', () => {
    const view = editor();
    change(/^Observaciones RRLL/, 'Mi nota');
    Object.assign(mocks.lock, { status: 'locked', isReadOnly: true, message: 'Bloqueo perdido' });
    view.rerender(<TeletrabajoEditor solicitud={{ ...solicitud, updatedAt: 'remote-token', observacionesRrll: 'Nota remota' }} mode="edit" onDone={mocks.done} />);
    expect(screen.getByText(/Esta solicitud ha recibido cambios externos/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Observaciones RRLL/)).toHaveValue('Mi nota');
    expect(saveButton()).toBeDisabled();
  });

  it('deshabilita el guardado durante una escritura pendiente', async () => {
    let resolve!: (value: { ok: boolean; message: string }) => void;
    mocks.update.mockReturnValueOnce(new Promise(res => { resolve = res; }));
    editor();
    fireEvent.click(saveButton());
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Guardando…' }));
    expect(mocks.update).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: false, message: 'Sin conexión' }));
    expect(saveButton()).toBeEnabled();
  });

  it('no cierra el editor si la eliminación falla', async () => {
    editor();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await screen.findByText('No se pudo eliminar');
    expect(mocks.remove).toHaveBeenCalledWith(solicitud.id, solicitud.updatedAt);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(mocks.done).not.toHaveBeenCalled();
  });

  it('muestra un error de generación Word sin cerrar ni guardar la solicitud', async () => {
    mocks.word.mockRejectedValueOnce(new Error('Plantilla no disponible'));
    editor();
    fireEvent.click(screen.getByRole('button', { name: 'Generar Word' }));
    await screen.findByText('Plantilla no disponible');
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.done).not.toHaveBeenCalled();
  });
});
