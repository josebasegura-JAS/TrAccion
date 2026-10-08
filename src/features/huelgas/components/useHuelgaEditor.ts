import { useState, type Dispatch, type SetStateAction } from 'react';
import type { HuelgaZona } from './huelgasZones';
import type { useAppDialog } from '../../../hooks/useAppDialog';
import { writeJsonStorageAsync } from '../../../services/persistence';
import {
  EMPTY_DRAFT,
  STORAGE_KEY,
  createId,
  reconcilePreparedCommunications,
  validateDraft,
  type Huelga,
  type HuelgaDraft,
} from './huelgasPageModel';

type AlertFn = ReturnType<typeof useAppDialog>['alert'];

type UseHuelgaEditorParams = {
  alert: AlertFn;
  huelgas: Huelga[];
  setHuelgas: Dispatch<SetStateAction<Huelga[]>>;
  zonas: HuelgaZona[];
};

export function useHuelgaEditor({ alert, huelgas, setHuelgas, zonas }: UseHuelgaEditorParams) {
  const [draft, setDraft] = useState<HuelgaDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, circuitosZonaIds: zonas.filter((zona) => zona.active && zona.correoActivo).map((zona) => zona.id) });
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
      circuitosZonaIds: huelga.circuitosZonaIds?.length ? [...huelga.circuitosZonaIds] : zonas.filter((zona) => zona.active && zona.correoActivo).map((zona) => zona.id),
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
      asignacionesPuesto: current?.asignacionesPuesto,
      instruccionesCorreoPorZona: current?.instruccionesCorreoPorZona,
      circuitosZonaIds: normalizedDraft.circuitosZonaIds,
      correosPreparadosPorZona: reconcilePreparedCommunications(current ?? null, normalizedDraft),
    };
    const next = current
      ? huelgas.map((item) => (item.id === current.id ? record : item))
      : [...huelgas, record];

    setSaving(true);
    const result = await writeJsonStorageAsync(STORAGE_KEY, next);
    setSaving(false);
    if (!result.ok) {
      await alert(result.message || 'No se ha podido guardar la huelga.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return;
    }

    setHuelgas(next);
    setEditorOpen(false);
  };

  return {
    addTramo,
    draft,
    editingId,
    editorOpen,
    openEdit,
    openNew,
    removeTramo,
    save,
    saving,
    setDraft,
    setEditorOpen,
    toggleSindicato,
    updateTramo,
  };
}
