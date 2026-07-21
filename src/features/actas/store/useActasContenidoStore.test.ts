import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_CENSO_MIEMBRO_DRAFT, type CensoMiembroDraft } from '../domain/censo';
import type { ActaPuntoDraft } from '../domain/actaContenido';
import {
  useActasContenidoStore,
  withAddedAcuerdo,
  withAddedPunto,
  withAddedVotacion,
  withMovedPunto,
  withRemovedPunto,
  withUpdatedAsistenciaEntry,
  withUpdatedPunto,
  withUpsertedVotacionPosicion,
} from './useActasContenidoStore';

const timestamp = '2026-05-21T08:00:00.000Z';

function censoDraft(overrides: Partial<CensoMiembroDraft> = {}): CensoMiembroDraft {
  return { ...EMPTY_CENSO_MIEMBRO_DRAFT, nombre: 'Persona Ejemplo', organizacion: 'ELA', ...overrides };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useActasContenidoStore — censo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
    window.localStorage.clear();
    useActasContenidoStore.setState({ censo: [], contenidos: {} });
  });

  it('rechaza un censo sin nombre', async () => {
    const result = await useActasContenidoStore.getState().addCensoMiembro(censoDraft({ nombre: '   ' }));
    expect(result.ok).toBe(false);
    expect(useActasContenidoStore.getState().censo).toHaveLength(0);
  });

  it('añade, actualiza y da de baja un miembro del censo, persistiendo en cada paso', async () => {
    await useActasContenidoStore.getState().addCensoMiembro(censoDraft({ nombre: '  Ander Cabrera  ' }));
    const id = useActasContenidoStore.getState().censo[0].id;
    expect(useActasContenidoStore.getState().censo[0].nombre).toBe('Ander Cabrera');

    await useActasContenidoStore.getState().updateCensoMiembro(id, censoDraft({ organizacion: 'CCOO' }));
    expect(useActasContenidoStore.getState().censo[0].organizacion).toBe('CCOO');

    await useActasContenidoStore.getState().toggleCensoMiembroDisabled(id);
    expect(useActasContenidoStore.getState().censo[0].disabled).toBe(true);

    expect(JSON.parse(window.localStorage.getItem('traccion.v1.actas.censo') ?? '[]')).toHaveLength(1);
  });
});

describe('useActasContenidoStore — contenido', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
    window.localStorage.clear();
    useActasContenidoStore.setState({ censo: [], contenidos: {} });
  });

  it('ensureContenido crea el contenido una sola vez, sembrando asistencia desde el censo y puntos dados', async () => {
    await useActasContenidoStore.getState().addCensoMiembro(censoDraft({ nombre: 'Persona A' }));

    const seedPuntos: ActaPuntoDraft[] = [
      { taskId: 'task-1', titulo: 'Punto A', contenido: '', resultado: 'sin_resolver' },
    ];

    const first = useActasContenidoStore.getState().ensureContenido('acta-1', seedPuntos);
    expect(first.asistencia).toHaveLength(1);
    expect(first.puntos).toEqual([
      expect.objectContaining({ taskId: 'task-1', titulo: 'Punto A', orden: 1 }),
    ]);

    // Segunda llamada no debe volver a sembrar ni duplicar nada.
    const second = useActasContenidoStore.getState().ensureContenido('acta-1', seedPuntos);
    expect(second).toBe(first);
    expect(useActasContenidoStore.getState().contenidos['acta-1'].puntos).toHaveLength(1);
  });

  it('withUpdatedAsistenciaEntry actualiza solo la entrada indicada', async () => {
    await useActasContenidoStore.getState().addCensoMiembro(censoDraft({ nombre: 'Persona A' }));
    await useActasContenidoStore.getState().addCensoMiembro(censoDraft({ nombre: 'Persona B' }));
    const contenido = useActasContenidoStore.getState().ensureContenido('acta-1');
    const [entryA, entryB] = contenido.asistencia;

    await useActasContenidoStore
      .getState()
      .updateContenido('acta-1', withUpdatedAsistenciaEntry(entryA.id, { estado: 'ausente' }));

    const updated = useActasContenidoStore.getState().contenidos['acta-1'];
    expect(updated.asistencia.find((entry) => entry.id === entryA.id)?.estado).toBe('ausente');
    expect(updated.asistencia.find((entry) => entry.id === entryB.id)?.estado).toBe('presente');
  });

  it('añade, edita y reordena puntos, renumerando el orden', async () => {
    useActasContenidoStore.getState().ensureContenido('acta-1');

    await useActasContenidoStore
      .getState()
      .updateContenido('acta-1', withAddedPunto({ taskId: null, titulo: 'Punto 1', contenido: '', resultado: 'sin_resolver' }));
    await useActasContenidoStore
      .getState()
      .updateContenido('acta-1', withAddedPunto({ taskId: null, titulo: 'Punto 2', contenido: '', resultado: 'sin_resolver' }));

    let puntos = useActasContenidoStore.getState().contenidos['acta-1'].puntos;
    expect(puntos.map((p) => p.titulo)).toEqual(['Punto 1', 'Punto 2']);
    const [punto1, punto2] = puntos;

    await useActasContenidoStore
      .getState()
      .updateContenido('acta-1', withUpdatedPunto(punto1.id, { contenido: 'Texto tratado', resultado: 'acuerdo' }));

    puntos = useActasContenidoStore.getState().contenidos['acta-1'].puntos;
    expect(puntos[0]).toMatchObject({ contenido: 'Texto tratado', resultado: 'acuerdo' });

    await useActasContenidoStore.getState().updateContenido('acta-1', withMovedPunto(punto2.id, 'up'));
    puntos = useActasContenidoStore.getState().contenidos['acta-1'].puntos;
    expect(puntos.map((p) => p.titulo)).toEqual(['Punto 2', 'Punto 1']);
    expect(puntos.map((p) => p.orden)).toEqual([1, 2]);

    await useActasContenidoStore.getState().updateContenido('acta-1', withRemovedPunto(punto1.id));
    puntos = useActasContenidoStore.getState().contenidos['acta-1'].puntos;
    expect(puntos.map((p) => p.titulo)).toEqual(['Punto 2']);
    expect(puntos[0].orden).toBe(1);
  });

  it('borrar un punto arrastra sus acuerdos y votaciones asociadas', async () => {
    useActasContenidoStore.getState().ensureContenido('acta-1');
    await useActasContenidoStore
      .getState()
      .updateContenido('acta-1', withAddedPunto({ taskId: null, titulo: 'Punto 1', contenido: '', resultado: 'sin_resolver' }));
    const puntoId = useActasContenidoStore.getState().contenidos['acta-1'].puntos[0].id;

    await useActasContenidoStore.getState().updateContenido(
      'acta-1',
      withAddedAcuerdo({ puntoId, descripcion: 'Compromiso', responsable: '', fechaLimite: '', estado: 'pendiente' }),
    );
    await useActasContenidoStore.getState().updateContenido('acta-1', withAddedVotacion({ puntoId, tema: 'Tema', posiciones: [] }));

    await useActasContenidoStore.getState().updateContenido('acta-1', withRemovedPunto(puntoId));

    const contenido = useActasContenidoStore.getState().contenidos['acta-1'];
    expect(contenido.acuerdos).toHaveLength(0);
    expect(contenido.votaciones).toHaveLength(0);
  });

  it('withUpsertedVotacionPosicion añade una posición nueva y actualiza una existente sin duplicar', async () => {
    useActasContenidoStore.getState().ensureContenido('acta-1');
    await useActasContenidoStore
      .getState()
      .updateContenido('acta-1', withAddedVotacion({ puntoId: null, tema: 'Renovación teletrabajo', posiciones: [] }));
    const votacionId = useActasContenidoStore.getState().contenidos['acta-1'].votaciones[0].id;

    await useActasContenidoStore
      .getState()
      .updateContenido('acta-1', withUpsertedVotacionPosicion(votacionId, 'ELA', { posicion: 'favor' }));
    await useActasContenidoStore
      .getState()
      .updateContenido(
        'acta-1',
        withUpsertedVotacionPosicion(votacionId, 'LAB', { posicion: 'pendiente' }),
      );

    let votacion = useActasContenidoStore.getState().contenidos['acta-1'].votaciones[0];
    expect(votacion.posiciones).toEqual([
      { organizacion: 'ELA', posicion: 'favor', fecha: null, observacion: '' },
      { organizacion: 'LAB', posicion: 'pendiente', fecha: null, observacion: '' },
    ]);

    // LAB responde días después por email: se actualiza la misma entrada, no se duplica.
    await useActasContenidoStore.getState().updateContenido(
      'acta-1',
      withUpsertedVotacionPosicion(votacionId, 'LAB', {
        posicion: 'abstencion',
        fecha: '2026-05-28',
        observacion: 'mediante email',
      }),
    );

    votacion = useActasContenidoStore.getState().contenidos['acta-1'].votaciones[0];
    expect(votacion.posiciones).toHaveLength(2);
    expect(votacion.posiciones.find((p) => p.organizacion === 'LAB')).toEqual({
      organizacion: 'LAB',
      posicion: 'abstencion',
      fecha: '2026-05-28',
      observacion: 'mediante email',
    });
  });

  it('persiste los contenidos en localStorage y los recupera con reloadFromStorage', async () => {
    useActasContenidoStore.getState().ensureContenido('acta-1');
    await useActasContenidoStore
      .getState()
      .updateContenido('acta-1', withAddedPunto({ taskId: null, titulo: 'Punto 1', contenido: '', resultado: 'sin_resolver' }));

    useActasContenidoStore.setState({ censo: [], contenidos: {} });
    useActasContenidoStore.getState().reloadFromStorage();

    expect(useActasContenidoStore.getState().contenidos['acta-1'].puntos).toHaveLength(1);
  });
});
