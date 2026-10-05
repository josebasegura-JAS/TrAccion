import { useState, type Dispatch, type SetStateAction } from 'react';
import type { useAppDialog } from '../../../hooks/useAppDialog';
import { writeJsonStorageAsync } from '../../../services/persistence';
import {
  DEFAULT_HUELGA_MAIL_BODY,
  DEFAULT_HUELGA_MAIL_SUBJECT,
  defaultDeadlineForZone,
  defaultMailEnabledForZone,
} from './huelgasMailTemplates';
import { createZonaId, ensureDefaultZonas, type HuelgaZona } from './huelgasZones';
import { createAreaId, type HuelgaArea } from './huelgasAreas';
import { AREAS_STORAGE_KEY, ZONAS_STORAGE_KEY } from './huelgasPageModel';

type AlertFn = ReturnType<typeof useAppDialog>['alert'];

type UseHuelgaZoneMastersParams = {
  alert: AlertFn;
  areas: HuelgaArea[];
  setAreas: Dispatch<SetStateAction<HuelgaArea[]>>;
  setZonas: Dispatch<SetStateAction<HuelgaZona[]>>;
  syncAssignmentsWithMasters: (zonas: HuelgaZona[], areas: HuelgaArea[]) => void;
  zonas: HuelgaZona[];
};

export function useHuelgaZoneMasters({
  alert,
  areas,
  setAreas,
  setZonas,
  syncAssignmentsWithMasters,
  zonas,
}: UseHuelgaZoneMastersParams) {
  const [zonesOpen, setZonesOpen] = useState(false);
  const [zoneDraft, setZoneDraft] = useState<HuelgaZona[]>([]);
  const [areaDraft, setAreaDraft] = useState<HuelgaArea[]>([]);
  const [newZoneName, setNewZoneName] = useState('');
  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaZoneId, setNewAreaZoneId] = useState('');
  const [savingZones, setSavingZones] = useState(false);

  const openZones = () => {
    setZoneDraft(ensureDefaultZonas(zonas));
    setAreaDraft(areas);
    setNewZoneName('');
    setNewAreaName('');
    setNewAreaZoneId(zonas.find((zona) => zona.active)?.id ?? '');
    setZonesOpen(true);
  };

  const closeZones = () => {
    if (savingZones) return;
    setZonesOpen(false);
    setZoneDraft([]);
    setAreaDraft([]);
    setNewZoneName('');
    setNewAreaName('');
    setNewAreaZoneId('');
  };

  const addZone = () => {
    const nombre = newZoneName.trim();
    if (!nombre) return;
    if (zoneDraft.some((zona) => zona.nombre.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0)) return;
    const now = new Date().toISOString();
    setZoneDraft((current) => [...current, {
      id: createZonaId(),
      nombre,
      responsableNombre: '',
      responsableEmail: '',
      correoActivo: defaultMailEnabledForZone(nombre),
      correoAsunto: DEFAULT_HUELGA_MAIL_SUBJECT,
      correoCuerpoHtml: DEFAULT_HUELGA_MAIL_BODY,
      correoPlazos: defaultDeadlineForZone(nombre),
      correoInstruccionesHabituales: '',
      active: true,
      createdAt: now,
      updatedAt: now,
    }].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })));
    setNewZoneName('');
  };

  const updateZone = (
    id: string,
    field: 'nombre' | 'responsableNombre' | 'responsableEmail' | 'correoActivo' | 'correoAsunto' | 'correoCuerpoHtml' | 'correoPlazos' | 'correoInstruccionesHabituales' | 'active',
    value: string | boolean,
  ) => {
    setZoneDraft((current) => current.map((zona) =>
      zona.id === id ? { ...zona, [field]: value, updatedAt: new Date().toISOString() } : zona,
    ));
  };

  const addArea = () => {
    const nombre = newAreaName.trim();
    if (!nombre || !newAreaZoneId) return;
    const duplicated = areaDraft.some(
      (area) =>
        area.zonaId === newAreaZoneId &&
        area.nombre.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0,
    );
    if (duplicated) return;
    const now = new Date().toISOString();
    setAreaDraft((current) =>
      [...current, {
        id: createAreaId(),
        nombre,
        zonaId: newAreaZoneId,
        active: true,
        createdAt: now,
        updatedAt: now,
      }].sort((a, b) => {
        const zoneOrder = a.zonaId.localeCompare(b.zonaId, 'es', { sensitivity: 'base' });
        return zoneOrder || a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
      }),
    );
    setNewAreaName('');
  };

  const updateArea = (
    id: string,
    field: 'nombre' | 'zonaId' | 'active',
    value: string | boolean,
  ) => {
    setAreaDraft((current) => current.map((area) =>
      area.id === id ? { ...area, [field]: value, updatedAt: new Date().toISOString() } : area,
    ));
  };

  const saveZones = async () => {
    const normalizedZones = zoneDraft.map((zona) => ({
      ...zona,
      nombre: zona.nombre.trim(),
      responsableNombre: zona.responsableNombre.trim(),
      responsableEmail: zona.responsableEmail.trim(),
      correoAsunto: zona.correoAsunto.trim(),
      correoPlazos: zona.correoPlazos.trim(),
      correoInstruccionesHabituales: zona.correoInstruccionesHabituales.trim(),
    }));
    if (normalizedZones.some((zona) => !zona.nombre)) {
      await alert('Todas las zonas deben tener un nombre.', { title: 'Revisa las zonas', type: 'warning' });
      return;
    }
    const zoneNames = new Set<string>();
    for (const zona of normalizedZones) {
      const key = zona.nombre.toLocaleLowerCase('es-ES');
      if (zoneNames.has(key)) {
        await alert(`La zona “${zona.nombre}” está duplicada.`, { title: 'Revisa las zonas', type: 'warning' });
        return;
      }
      zoneNames.add(key);
    }

    const normalizedAreas = areaDraft.map((area) => ({ ...area, nombre: area.nombre.trim() }));
    if (normalizedAreas.some((area) => !area.nombre || !area.zonaId)) {
      await alert('Todas las áreas deben tener nombre y una zona asignada.', { title: 'Revisa las áreas', type: 'warning' });
      return;
    }
    const areaNames = new Set<string>();
    for (const area of normalizedAreas) {
      const key = `${area.zonaId}::${area.nombre.toLocaleLowerCase('es-ES')}`;
      if (areaNames.has(key)) {
        await alert(`El área “${area.nombre}” está duplicada dentro de la misma zona.`, { title: 'Revisa las áreas', type: 'warning' });
        return;
      }
      areaNames.add(key);
    }

    setSavingZones(true);
    const zoneResult = await writeJsonStorageAsync(ZONAS_STORAGE_KEY, normalizedZones);
    if (!zoneResult.ok) {
      setSavingZones(false);
      await alert(zoneResult.message || 'No se ha podido guardar el maestro de zonas.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return;
    }
    const areaResult = await writeJsonStorageAsync(AREAS_STORAGE_KEY, normalizedAreas);
    setSavingZones(false);
    if (!areaResult.ok) {
      await alert(areaResult.message || 'No se ha podido guardar el maestro de áreas.', {
        title: 'Error de guardado',
        type: 'error',
      });
      return;
    }

    setZonas(normalizedZones);
    setAreas(normalizedAreas);
    syncAssignmentsWithMasters(normalizedZones, normalizedAreas);
    closeZones();
  };

  return {
    addArea,
    addZone,
    areaDraft,
    closeZones,
    newAreaName,
    newAreaZoneId,
    newZoneName,
    openZones,
    saveZones,
    savingZones,
    setNewAreaName,
    setNewAreaZoneId,
    setNewZoneName,
    updateArea,
    updateZone,
    zoneDraft,
    zonesOpen,
  };
}
