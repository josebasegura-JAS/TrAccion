import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, FileSpreadsheet, Trash2, UsersRound } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { readJsonStorage, writeJsonStorageAsync } from '../../../services/persistence';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';
import { parseHuelgaPersonalRows, type HuelgaPersonalTurno } from './huelgasPersonalImport';

const STORAGE_KEY = 'traccion.v1.huelgas.records';

type HuelgaTipo = 'jornada-completa' | 'paros-parciales';

type HuelgaTramo = {
  id: string;
  inicio: string;
  fin: string;
};

type Huelga = {
  id: string;
  fecha: string;
  sindicatos: string[];
  tipo: HuelgaTipo;
  tramos: HuelgaTramo[];
  observaciones: string;
  createdAt: string;
  updatedAt: string;
  personalConTurno?: HuelgaPersonalTurno[];
  personalImportadoAt?: string | null;
};

type HuelgaDraft = Pick<Huelga, 'fecha' | 'sindicatos' | 'tipo' | 'tramos' | 'observaciones'>;

const EMPTY_DRAFT: HuelgaDraft = {
  fecha: '',
  sindicatos: [],
  tipo: 'jornada-completa',
  tramos: [],
  observaciones: '',
};

function isHuelga(value: unknown): value is Huelga {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Huelga>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.fecha === 'string' &&
    Array.isArray(candidate.sindicatos) &&
    candidate.sindicatos.every((item) => typeof item === 'string') &&
    (candidate.tipo === 'jornada-completa' || candidate.tipo === 'paros-parciales') &&
    Array.isArray(candidate.tramos) &&
    typeof candidate.observaciones === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    (typeof candidate.personalConTurno === 'undefined' || Array.isArray(candidate.personalConTurno)) &&
    (typeof candidate.personalImportadoAt === 'undefined' || candidate.personalImportadoAt === null || typeof candidate.personalImportadoAt === 'string')
  );
}

function isHuelgas(value: unknown): value is Huelga[] {
  return Array.isArray(value) && value.every(isHuelga);
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayIso(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function huelgaStatus(fecha: string): 'Hoy' | 'Próxima' | 'Finalizada' {
  const today = todayIso();
  if (fecha === today) return 'Hoy';
  return fecha > today ? 'Próxima' : 'Finalizada';
}

function statusClass(status: ReturnType<typeof huelgaStatus>): string {
  if (status === 'Hoy') return 'border-red-500/40 bg-red-500/15 text-red-200';
  if (status === 'Próxima') return 'border-amber-500/40 bg-amber-500/15 text-amber-200';
  return 'border-metro-border bg-metro-panel/70 text-metro-muted';
}

function convocatoriaLabel(huelga: Pick<Huelga, 'tipo' | 'tramos'>): string {
  if (huelga.tipo === 'jornada-completa') return 'Jornada completa';
  if (huelga.tramos.length === 0) return 'Paros parciales';
  return huelga.tramos.map((tramo) => `${tramo.inicio}–${tramo.fin}`).join(' · ');
}

function validateDraft(draft: HuelgaDraft): string | null {
  if (!draft.fecha) return 'Indica la fecha de la huelga.';
  if (draft.sindicatos.length === 0) return 'Selecciona al menos un sindicato convocante.';
  if (draft.tipo === 'paros-parciales') {
    if (draft.tramos.length === 0) return 'Añade al menos un tramo horario para los paros parciales.';
    for (const tramo of draft.tramos) {
      if (!tramo.inicio || !tramo.fin) return 'Completa la hora de inicio y fin de todos los tramos.';
      if (tramo.inicio >= tramo.fin) return 'La hora de fin de cada tramo debe ser posterior a la de inicio.';
    }
  }
  return null;
}

export function HuelgasPage() {
  const { alert, confirm, dialogNode } = useAppDialog();
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const [huelgas, setHuelgas] = useState<Huelga[]>([]);
  const [draft, setDraft] = useState<HuelgaDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importTargetId, setImportTargetId] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importPreview, setImportPreview] = useState<HuelgaPersonalTurno[]>([]);
  const [importSkippedRows, setImportSkippedRows] = useState(0);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    loadConfiguracion();
    setHuelgas(readJsonStorage(STORAGE_KEY, [], isHuelgas));
  }, [loadConfiguracion]);

  const sindicatos = useMemo(
    () =>
      taskOrigins
        .filter((origin) => origin.tipo === 'sindicato' && origin.active && !origin.deletedAt)
        .map((origin) => origin.nombre)
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
    [taskOrigins],
  );

  const sortedHuelgas = useMemo(
    () => [...huelgas].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    [huelgas],
  );

  const nextHuelga = useMemo(
    () =>
      huelgas
        .filter((huelga) => huelga.fecha >= todayIso())
        .sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null,
    [huelgas],
  );

  const openNew = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setEditorOpen(true);
  };

  const openEdit = (huelga: Huelga) => {
    setEditingId(huelga.id);
    setDraft({
      fecha: huelga.fecha,
      sindicatos: [...huelga.sindicatos],
      tipo: huelga.tipo,
      tramos: huelga.tramos.map((tramo) => ({ ...tramo })),
      observaciones: huelga.observaciones,
    });
    setEditorOpen(true);
  };

  const toggleSindicato = (sindicato: string) => {
    setDraft((current) => ({
      ...current,
      sindicatos: current.sindicatos.includes(sindicato)
        ? current.sindicatos.filter((item) => item !== sindicato)
        : [...current.sindicatos, sindicato],
    }));
  };

  const addTramo = () => {
    setDraft((current) => ({
      ...current,
      tramos: [...current.tramos, { id: createId('tramo'), inicio: '', fin: '' }],
    }));
  };

  const updateTramo = (id: string, field: 'inicio' | 'fin', value: string) => {
    setDraft((current) => ({
      ...current,
      tramos: current.tramos.map((tramo) => (tramo.id === id ? { ...tramo, [field]: value } : tramo)),
    }));
  };

  const removeTramo = (id: string) => {
    setDraft((current) => ({ ...current, tramos: current.tramos.filter((tramo) => tramo.id !== id) }));
  };

  const save = async () => {
    const validation = validateDraft(draft);
    if (validation) {
      await alert(validation, { title: 'Revisa la convocatoria', type: 'warning' });
      return;
    }

    const now = new Date().toISOString();
    const current = editingId ? huelgas.find((item) => item.id === editingId) : null;
    const normalizedDraft: HuelgaDraft = {
      ...draft,
      sindicatos: [...draft.sindicatos].sort((a, b) => a.localeCompare(b, 'es')),
      tramos: draft.tipo === 'jornada-completa' ? [] : draft.tramos,
      observaciones: draft.observaciones.trim(),
    };
    const record: Huelga = {
      id: current?.id ?? createId('huelga'),
      ...normalizedDraft,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      personalConTurno: current?.personalConTurno,
      personalImportadoAt: current?.personalImportadoAt ?? null,
    };
    const next = current
      ? huelgas.map((item) => (item.id === current.id ? record : item))
      : [...huelgas, record];

    setSaving(true);
    const result = await writeJsonStorageAsync(STORAGE_KEY, next);
    setSaving(false);
    if (!result.ok) {
      await alert(result.message || 'No se ha podido guardar la huelga.', { title: 'Error de guardado', type: 'error' });
      return;
    }

    setHuelgas(next);
    setEditorOpen(false);
  };

  const importTarget = importTargetId ? huelgas.find((item) => item.id === importTargetId) ?? null : null;

  const openImport = (huelga: Huelga) => {
    setImportTargetId(huelga.id);
    setImportFileName('');
    setImportPreview([]);
    setImportSkippedRows(0);
    setImportError('');
  };

  const closeImport = () => {
    if (importing) return;
    setImportTargetId(null);
    setImportFileName('');
    setImportPreview([]);
    setImportSkippedRows(0);
    setImportError('');
  };

  const selectImportFile = async (file: File | null) => {
    setImportError('');
    setImportPreview([]);
    setImportSkippedRows(0);
    setImportFileName(file?.name ?? '');
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      setImportError('Selecciona un archivo Excel .xlsx con el formato de personal por día.');
      return;
    }

    try {
      const rows = await parseXlsxRows(await file.arrayBuffer());
      const result = parseHuelgaPersonalRows(rows);
      setImportPreview(result.records);
      setImportSkippedRows(result.skippedRows);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'No se ha podido leer el Excel.');
    }
  };

  const saveImportedPersonal = async () => {
    if (!importTarget || importPreview.length === 0) return;

    if ((importTarget.personalConTurno?.length ?? 0) > 0) {
      const accepted = await confirm(
        `Esta huelga ya tiene ${importTarget.personalConTurno?.length ?? 0} personas importadas. ¿Quieres sustituirlas por las ${importPreview.length} del nuevo Excel?`,
        { title: 'Sustituir personal importado', confirmLabel: 'Sustituir', cancelLabel: 'Cancelar' },
      );
      if (!accepted) return;
    }

    const now = new Date().toISOString();
    const next = huelgas.map((item) =>
      item.id === importTarget.id
        ? { ...item, personalConTurno: importPreview, personalImportadoAt: now, updatedAt: now }
        : item,
    );

    setImporting(true);
    const result = await writeJsonStorageAsync(STORAGE_KEY, next);
    setImporting(false);
    if (!result.ok) {
      await alert(result.message || 'No se ha podido guardar el personal importado.', { title: 'Error de guardado', type: 'error' });
      return;
    }

    setHuelgas(next);
    closeImport();
  };

  const remove = async (huelga: Huelga) => {
    const accepted = await confirm(
      `¿Eliminar la convocatoria del ${formatDate(huelga.fecha)}?`,
      { title: 'Eliminar huelga', confirmLabel: 'Eliminar', cancelLabel: 'Cancelar' },
    );
    if (!accepted) return;

    const next = huelgas.filter((item) => item.id !== huelga.id);
    const result = await writeJsonStorageAsync(STORAGE_KEY, next);
    if (!result.ok) {
      await alert(result.message || 'No se ha podido eliminar la huelga.', { title: 'Error de guardado', type: 'error' });
      return;
    }
    setHuelgas(next);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Huelgas"
        actions={<ActionButton variant="add" iconOnly={false} onClick={openNew}>Nueva huelga</ActionButton>}
      />

      {nextHuelga ? (
        <section className="rounded-2xl border border-metro-border bg-metro-panel/75 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-metro-red/15 text-metro-red">
                <CalendarDays size={21} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-metro-muted">Próxima convocatoria</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <strong className="text-base text-metro-text">{formatDate(nextHuelga.fecha)}</strong>
                  <span className="text-sm text-metro-muted">{convocatoriaLabel(nextHuelga)}</span>
                </div>
                <p className="mt-1 truncate text-sm text-metro-muted">{nextHuelga.sindicatos.join(' · ')}</p>
              </div>
            </div>
            <ActionButton variant="edit" onClick={() => openEdit(nextHuelga)} title="Editar próxima huelga" />
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-metro-border bg-metro-panel/40 px-5 py-4 text-sm text-metro-muted">
          No hay próximas convocatorias registradas.
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-metro-border bg-metro-panel/75 shadow-sm">
        <div className="flex items-center justify-between border-b border-metro-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-metro-text">Convocatorias</h3>
            <p className="mt-0.5 text-xs text-metro-muted">{huelgas.length} registrada{huelgas.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        {sortedHuelgas.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <CalendarDays className="text-metro-muted" size={32} />
            <div>
              <p className="font-medium text-metro-text">Todavía no hay huelgas registradas</p>
              <p className="mt-1 text-sm text-metro-muted">Da de alta la primera convocatoria para iniciar el seguimiento.</p>
            </div>
            <ActionButton variant="add" iconOnly={false} onClick={openNew}>Nueva huelga</ActionButton>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-metro-raised/70 text-[11px] uppercase tracking-wide text-metro-muted">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Fecha</th>
                  <th className="px-4 py-2.5 font-semibold">Convocantes</th>
                  <th className="px-4 py-2.5 font-semibold">Tipo</th>
                  <th className="px-4 py-2.5 font-semibold">Estado</th>
                  <th className="px-4 py-2.5 font-semibold">Personal del día</th>
                  <th className="w-40 px-4 py-2.5 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-metro-border">
                {sortedHuelgas.map((huelga) => {
                  const status = huelgaStatus(huelga.fecha);
                  return (
                    <tr className="transition hover:bg-metro-raised/45" key={huelga.id}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-metro-text">{formatDate(huelga.fecha)}</td>
                      <td className="px-4 py-3 text-metro-text">{huelga.sindicatos.join(' · ')}</td>
                      <td className="px-4 py-3 text-metro-muted">{convocatoriaLabel(huelga)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>{status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {(huelga.personalConTurno?.length ?? 0) > 0 ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200">
                            <UsersRound size={13} /> {huelga.personalConTurno?.length} personas
                          </span>
                        ) : (
                          <span className="text-xs text-metro-muted">Sin importar</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <ActionButton variant="import" size="sm" iconOnly={false} onClick={() => openImport(huelga)} title="Importar personal trabajador del día de la huelga">Importar personal</ActionButton>
                          <ActionButton variant="edit" size="sm" onClick={() => openEdit(huelga)} title="Editar huelga" />
                          <ActionButton variant="delete" size="sm" onClick={() => remove(huelga)} title="Eliminar huelga" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {importTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation">
          <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-import-title">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-metro-border bg-metro-app/95 px-5 py-4 backdrop-blur">
              <div>
                <h2 id="huelga-import-title" className="text-lg font-semibold text-metro-text">Importar personal con turno</h2>
                <p className="mt-1 text-sm text-metro-muted">{formatDate(importTarget.fecha)} · Personal trabajador previsto para ese día de huelga.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={closeImport} type="button" aria-label="Cerrar">×</button>
            </div>

            <div className="space-y-4 p-5">
              <section className="rounded-xl border border-metro-border bg-metro-panel/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><FileSpreadsheet size={20} /></div>
                    <div>
                      <p className="text-sm font-semibold text-metro-text">Excel de personal por día</p>
                      <p className="mt-1 text-xs text-metro-muted">Columnas esperadas: Resi./Estac., Inicio, Salida, Entrada, Fin, Nombre y Apellidos, Puesto y Turno.</p>
                    </div>
                  </div>
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3.5 text-sm font-semibold text-metro-text transition hover:border-metro-red hover:bg-metro-raised">
                    <FileSpreadsheet size={16} /> Seleccionar Excel
                    <input className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void selectImportFile(event.target.files?.[0] ?? null)} />
                  </label>
                </div>
                {importFileName && <p className="mt-3 text-xs text-metro-muted">Archivo: <span className="font-medium text-metro-text">{importFileName}</span></p>}
              </section>

              {importError && <div className="rounded-xl border border-red-500/40 bg-red-950/25 px-4 py-3 text-sm text-red-200">{importError}</div>}

              {importPreview.length > 0 && (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Personas detectadas</p><strong className="mt-1 block text-xl text-metro-text">{importPreview.length}</strong></div>
                    <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Filas omitidas</p><strong className="mt-1 block text-xl text-metro-text">{importSkippedRows}</strong></div>
                    <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Actualmente importadas</p><strong className="mt-1 block text-xl text-metro-text">{importTarget.personalConTurno?.length ?? 0}</strong></div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-metro-border">
                    <div className="border-b border-metro-border bg-metro-raised/60 px-4 py-2.5"><p className="text-xs font-semibold uppercase tracking-wide text-metro-muted">Vista previa · primeras {Math.min(importPreview.length, 8)} personas</p></div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] text-left text-xs">
                        <thead className="bg-metro-panel text-metro-muted"><tr><th className="px-3 py-2">Nombre y apellidos</th><th className="px-3 py-2">Resi./Estac.</th><th className="px-3 py-2">Horario</th><th className="px-3 py-2">Puesto</th><th className="px-3 py-2">Turno</th></tr></thead>
                        <tbody className="divide-y divide-metro-border">
                          {importPreview.slice(0, 8).map((persona) => (
                            <tr key={persona.id}>
                              <td className="px-3 py-2 font-medium text-metro-text">{persona.nombreApellidos}</td>
                              <td className="px-3 py-2 text-metro-muted">{persona.residenciaEstacion || '—'}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-metro-muted">{persona.inicio || '—'}–{persona.fin || '—'}{persona.salida || persona.entrada ? ` · ${persona.salida || '—'} / ${persona.entrada || '—'}` : ''}</td>
                              <td className="px-3 py-2 text-metro-muted">{persona.puesto || '—'}</td>
                              <td className="px-3 py-2 text-metro-muted">{persona.turno || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-metro-border bg-metro-app/95 px-5 py-4 backdrop-blur">
              <ActionButton variant="secondary" iconOnly={false} onClick={closeImport}>Cancelar</ActionButton>
              <ActionButton variant="import" iconOnly={false} loading={importing} disabled={importPreview.length === 0} onClick={() => void saveImportedPersonal()}>
                Importar {importPreview.length > 0 ? `${importPreview.length} personas` : 'personal'}
              </ActionButton>
            </div>
          </section>
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation">
          <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-editor-title">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-metro-border bg-metro-app/95 px-5 py-4 backdrop-blur">
              <div>
                <h2 id="huelga-editor-title" className="text-lg font-semibold text-metro-text">{editingId ? 'Editar convocatoria' : 'Nueva convocatoria de huelga'}</h2>
                <p className="mt-1 text-sm text-metro-muted">Registra los datos básicos de la jornada convocada.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={() => setEditorOpen(false)} type="button" aria-label="Cerrar">×</button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium text-metro-text">
                  Fecha de huelga <span className="text-metro-red">*</span>
                  <input className="w-full rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-metro-text outline-none focus:border-metro-red" type="date" value={draft.fecha} onChange={(event) => setDraft((current) => ({ ...current, fecha: event.target.value }))} />
                </label>

                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium text-metro-text">Tipo de convocatoria <span className="text-metro-red">*</span></legend>
                  <div className="grid grid-cols-2 gap-2">
                    <button className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${draft.tipo === 'jornada-completa' ? 'border-metro-red bg-metro-red/15 text-metro-text' : 'border-metro-border bg-metro-panel text-metro-muted hover:bg-metro-raised'}`} onClick={() => setDraft((current) => ({ ...current, tipo: 'jornada-completa', tramos: [] }))} type="button">Jornada completa</button>
                    <button className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${draft.tipo === 'paros-parciales' ? 'border-metro-red bg-metro-red/15 text-metro-text' : 'border-metro-border bg-metro-panel text-metro-muted hover:bg-metro-raised'}`} onClick={() => setDraft((current) => ({ ...current, tipo: 'paros-parciales', tramos: current.tramos.length ? current.tramos : [{ id: createId('tramo'), inicio: '', fin: '' }] }))} type="button">Paros parciales</button>
                  </div>
                </fieldset>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-metro-text">Sindicato/s convocante/s <span className="text-metro-red">*</span></legend>
                <div className="flex flex-wrap gap-2 rounded-xl border border-metro-border bg-metro-panel p-3">
                  {sindicatos.length === 0 ? (
                    <p className="text-sm text-metro-muted">No hay sindicatos activos configurados.</p>
                  ) : sindicatos.map((sindicato) => {
                    const selected = draft.sindicatos.includes(sindicato);
                    return <button key={sindicato} type="button" onClick={() => toggleSindicato(sindicato)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selected ? 'border-metro-red bg-metro-red text-white' : 'border-metro-border bg-metro-app text-metro-muted hover:border-metro-red hover:text-metro-text'}`}>{sindicato}</button>;
                  })}
                </div>
              </fieldset>

              {draft.tipo === 'paros-parciales' && (
                <fieldset className="space-y-3 rounded-xl border border-metro-border bg-metro-panel/55 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <legend className="text-sm font-medium text-metro-text">Tramos de paro</legend>
                    <ActionButton variant="add" size="sm" iconOnly={false} onClick={addTramo}>Añadir tramo</ActionButton>
                  </div>
                  <div className="space-y-2">
                    {draft.tramos.map((tramo, index) => (
                      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-end gap-2" key={tramo.id}>
                        <label className="space-y-1 text-xs text-metro-muted">Inicio<input className="w-full rounded-lg border border-metro-border bg-metro-app px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" type="time" value={tramo.inicio} onChange={(event) => updateTramo(tramo.id, 'inicio', event.target.value)} /></label>
                        <span className="pb-2 text-metro-muted">—</span>
                        <label className="space-y-1 text-xs text-metro-muted">Fin<input className="w-full rounded-lg border border-metro-border bg-metro-app px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red" type="time" value={tramo.fin} onChange={(event) => updateTramo(tramo.id, 'fin', event.target.value)} /></label>
                        <button className="mb-0.5 rounded-lg border border-metro-border p-2 text-metro-muted transition hover:border-red-500/50 hover:bg-red-950/25 hover:text-red-200" type="button" onClick={() => removeTramo(tramo.id)} aria-label={`Eliminar tramo ${index + 1}`}><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                </fieldset>
              )}

              <label className="block space-y-1.5 text-sm font-medium text-metro-text">
                Observaciones
                <textarea className="min-h-24 w-full resize-y rounded-xl border border-metro-border bg-metro-panel px-3 py-2.5 text-sm text-metro-text outline-none focus:border-metro-red" placeholder="Texto breve sobre la convocatoria..." value={draft.observaciones} onChange={(event) => setDraft((current) => ({ ...current, observaciones: event.target.value }))} />
              </label>

              <div className="grid gap-3 rounded-xl border border-metro-border bg-metro-panel/45 p-3 text-xs text-metro-muted sm:grid-cols-3">
                <div className="flex items-center gap-2"><CalendarDays size={15} /> Fecha de convocatoria</div>
                <div className="flex items-center gap-2"><UsersRound size={15} /> Uno o varios sindicatos</div>
                <div className="flex items-center gap-2"><Clock3 size={15} /> Varios tramos si procede</div>
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-metro-border bg-metro-app/95 px-5 py-4 backdrop-blur">
              <ActionButton variant="secondary" iconOnly={false} onClick={() => setEditorOpen(false)}>Cancelar</ActionButton>
              <ActionButton variant="save" iconOnly={false} loading={saving} onClick={save}>{editingId ? 'Guardar cambios' : 'Guardar huelga'}</ActionButton>
            </div>
          </section>
        </div>
      )}

      {dialogNode}
    </div>
  );
}
