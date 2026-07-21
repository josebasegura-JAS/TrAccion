import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Eye,
  Plus,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Input, Select, Textarea } from '../../../components/ui/Field';
import { RichTextEditor } from '../../../components/ui/RichTextEditor';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalShell } from '../../../components/ui/ModalShell';
import { Notice } from '../../../components/ui/Notice';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { Acta } from '../domain/acta';
import {
  ACTA_ACUERDO_ESTADOS,
  ACTA_PUNTO_RESULTADOS,
  VOTACION_POSICIONES,
  selectIncompleteAcuerdos,
  selectUnresolvedPuntos,
  selectVotacionesConPendientes,
  summarizeVotacionPosiciones,
  type ActaAcuerdoEstado,
  type ActaAsistenciaEntry,
  type ActaPuntoResultado,
  type VotacionPosicion,
} from '../domain/actaContenido';
import { selectActiveCensoMiembros } from '../domain/censo';
import { buildActaDraftText } from '../domain/actaDraftText';
import {
  useActasContenidoStore,
  withAddedAcuerdo,
  withAddedPunto,
  withAddedReceso,
  withAddedVotacion,
  withMovedPunto,
  withRemovedAcuerdo,
  withRemovedPunto,
  withRemovedReceso,
  withRemovedVotacion,
  withUpdatedAcuerdo,
  withUpdatedAsistenciaEntry,
  withUpdatedPunto,
  withUpdatedReceso,
  withUpsertedVotacionPosicion,
} from '../store/useActasContenidoStore';

const RESULTADO_LABELS: Record<ActaPuntoResultado, string> = {
  sin_resolver: 'Sin resolver',
  acuerdo: 'Acuerdo',
  sin_acuerdo: 'Sin acuerdo',
  pendiente_votacion: 'Pendiente de votación',
};

const ACUERDO_ESTADO_LABELS: Record<ActaAcuerdoEstado, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  cumplido: 'Cumplido',
};

const VOTACION_POSICION_LABELS: Record<VotacionPosicion, string> = {
  favor: 'A favor',
  contra: 'En contra',
  abstencion: 'Abstención',
  pendiente: 'Pendiente',
  no_participa: 'No participa',
};

const GRUPOS_ORDEN = ['Dirección', 'Representación Sindical', 'Invitado'] as const;

function sectionClassName(): string {
  return 'space-y-3 rounded-xl border border-metro-border bg-metro-panel/40 p-3';
}

function sectionTitleClassName(): string {
  return 'text-sm font-bold uppercase tracking-wide text-metro-muted';
}

export function ActaContenidoModal({ acta, onClose }: { acta: Acta; onClose: () => void }) {
  const censo = useActasContenidoStore((state) => state.censo);
  const contenido = useActasContenidoStore((state) => state.ensureContenido(acta.id));
  const updateContenido = useActasContenidoStore((state) => state.updateContenido);
  const [nuevoPuntoTitulo, setNuevoPuntoTitulo] = useState('');
  const [saveError, setSaveError] = useState('');
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [collapsedPuntos, setCollapsedPuntos] = useState<Set<string>>(() => new Set());
  const [copyFeedback, setCopyFeedback] = useState('');

  const activeCenso = useMemo(
    () => selectActiveCensoMiembros(censo, acta.tipo),
    [censo, acta.tipo],
  );

  const asistenciaByGrupo = useMemo(() => {
    const grouped: Record<(typeof GRUPOS_ORDEN)[number], ActaAsistenciaEntry[]> = {
      Dirección: [],
      'Representación Sindical': [],
      Invitado: [],
    };
    for (const entry of contenido.asistencia) {
      grouped[entry.grupo].push(entry);
    }
    return grouped;
  }, [contenido.asistencia]);

  const sindicatosDelCenso = useMemo(
    () =>
      activeCenso
        .filter((miembro) => miembro.grupo === 'Representación Sindical' && miembro.organizacion)
        .filter(
          (miembro, index, all) =>
            all.findIndex((m) => m.organizacion === miembro.organizacion) === index,
        ),
    [activeCenso],
  );

  const unresolvedPuntos = selectUnresolvedPuntos(contenido);
  const incompleteAcuerdos = selectIncompleteAcuerdos(contenido);
  const votacionesConPendientes = selectVotacionesConPendientes(contenido);
  const hasControlPreviaWarnings =
    unresolvedPuntos.length > 0 ||
    incompleteAcuerdos.length > 0 ||
    votacionesConPendientes.length > 0;
  const draftText = useMemo(() => buildActaDraftText(acta, contenido), [acta, contenido]);

  async function commit(updater: Parameters<typeof updateContenido>[1]) {
    const result = await updateContenido(acta.id, updater);
    setSaveError(result.ok ? '' : result.message);
  }

  function togglePunto(puntoId: string) {
    setCollapsedPuntos((current) => {
      const next = new Set(current);
      if (next.has(puntoId)) next.delete(puntoId);
      else next.add(puntoId);
      return next;
    });
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draftText);
      setCopyFeedback('Borrador copiado');
      window.setTimeout(() => setCopyFeedback(''), 1800);
    } catch {
      setCopyFeedback('No se pudo copiar');
    }
  }

  return (
    <ModalShell labelledBy="acta-contenido-titulo" maxWidthClassName="max-w-4xl" onClose={onClose}>
      <div className="flex items-center justify-between border-b border-metro-border px-4 py-3">
        <div>
          <h3 className="text-lg font-bold text-metro-text" id="acta-contenido-titulo">
            Contenido: {acta.titulo || 'Acta sin título'}
          </h3>
          <p className="text-xs text-metro-muted">
            {acta.tipo} · {acta.fechaSesion || 'Sin fecha de sesión'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ActionButton
            onClick={() => setShowDraftPreview((value) => !value)}
            size="sm"
            title="Ver borrador generado"
            variant="secondary"
          >
            <Eye size={14} />
            {showDraftPreview ? 'Volver a editar' : 'Vista borrador'}
          </ActionButton>
          <ModalCloseButton onClick={onClose} />
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {saveError && <Notice tone="error">{saveError}</Notice>}

        {showDraftPreview ? (
          <section className="space-y-3 rounded-xl border border-metro-border bg-metro-surface p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-metro-text">Borrador generado</h4>
                <p className="text-xs text-metro-muted">
                  Texto base para revisar y trasladar a la plantilla Word.
                </p>
              </div>
              <ActionButton
                onClick={() => void copyDraft()}
                size="sm"
                title="Copiar borrador"
                variant="add"
              >
                {copyFeedback === 'Borrador copiado' ? (
                  <Check size={14} />
                ) : (
                  <ClipboardCopy size={14} />
                )}
                {copyFeedback || 'Copiar texto'}
              </ActionButton>
            </div>
            <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-lg border border-metro-border bg-white p-4 font-sans text-sm leading-6 text-slate-800">
              {draftText}
            </pre>
          </section>
        ) : (
          <>
            {hasControlPreviaWarnings && (
              <Notice tone="warning">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                  <ul className="list-disc space-y-0.5 pl-4 font-normal normal-case">
                    {unresolvedPuntos.length > 0 && (
                      <li>
                        {unresolvedPuntos.length} punto{unresolvedPuntos.length > 1 ? 's' : ''} del
                        día sin resultado ({unresolvedPuntos.map((p) => p.titulo).join(', ')}).
                      </li>
                    )}
                    {incompleteAcuerdos.length > 0 && (
                      <li>
                        {incompleteAcuerdos.length} acuerdo
                        {incompleteAcuerdos.length > 1 ? 's' : ''} sin responsable o sin fecha
                        límite.
                      </li>
                    )}
                    {votacionesConPendientes.length > 0 && (
                      <li>
                        {votacionesConPendientes.length} votación
                        {votacionesConPendientes.length > 1 ? 'es' : ''} con alguna posición
                        pendiente ({votacionesConPendientes.map((v) => v.tema).join(', ')}).
                      </li>
                    )}
                  </ul>
                </div>
              </Notice>
            )}

            {/* Datos generales */}
            <section className={sectionClassName()}>
              <h4 className={sectionTitleClassName()}>Datos generales</h4>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold text-metro-muted">
                  Lugar
                  <Input
                    onChange={(event) => void commit((c) => ({ ...c, lugar: event.target.value }))}
                    value={contenido.lugar}
                  />
                </label>
                <label className="text-xs font-semibold text-metro-muted">
                  Hora inicio
                  <Input
                    onChange={(event) =>
                      void commit((c) => ({ ...c, horaInicio: event.target.value }))
                    }
                    type="time"
                    value={contenido.horaInicio}
                  />
                </label>
                <label className="text-xs font-semibold text-metro-muted">
                  Hora fin
                  <Input
                    onChange={(event) =>
                      void commit((c) => ({ ...c, horaFin: event.target.value }))
                    }
                    type="time"
                    value={contenido.horaFin}
                  />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-metro-muted">Recesos</span>
                  <ActionButton
                    onClick={() => void commit(withAddedReceso({ horaInicio: '', horaFin: '' }))}
                    size="sm"
                    title="Añadir receso"
                    variant="add"
                  >
                    Añadir
                  </ActionButton>
                </div>
                {contenido.recesos.map((receso) => (
                  <div className="flex items-center gap-2" key={receso.id}>
                    <Input
                      onChange={(event) =>
                        void commit(
                          withUpdatedReceso(receso.id, { horaInicio: event.target.value }),
                        )
                      }
                      type="time"
                      value={receso.horaInicio}
                    />
                    <span className="text-metro-muted">–</span>
                    <Input
                      onChange={(event) =>
                        void commit(withUpdatedReceso(receso.id, { horaFin: event.target.value }))
                      }
                      type="time"
                      value={receso.horaFin}
                    />
                    <ActionButton
                      onClick={() => void commit(withRemovedReceso(receso.id))}
                      size="sm"
                      title="Quitar receso"
                      variant="delete"
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Asistencia */}
            <section className={sectionClassName()}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-metro-muted" />
                  <h4 className={sectionTitleClassName()}>Asistencia</h4>
                </div>
                {contenido.asistencia.length > 0 && (
                  <div className="flex gap-2">
                    <ActionButton
                      onClick={() =>
                        void commit((c) => ({
                          ...c,
                          asistencia: c.asistencia.map((entry) => ({
                            ...entry,
                            estado: 'presente' as const,
                          })),
                        }))
                      }
                      size="sm"
                      title="Marcar todo el censo como presente"
                      variant="secondary"
                    >
                      Todos presentes
                    </ActionButton>
                  </div>
                )}
              </div>
              {activeCenso.length === 0 && (
                <Notice tone="info">
                  No hay censo dado de alta para {acta.tipo}. Da de alta a los miembros desde
                  &quot;Gestionar censo&quot; para poder pasar lista.
                </Notice>
              )}
              {GRUPOS_ORDEN.map((grupo) =>
                asistenciaByGrupo[grupo].length === 0 ? null : (
                  <div className="space-y-1.5" key={grupo}>
                    <p className="text-xs font-semibold text-metro-muted">{grupo}</p>
                    <div className="space-y-1.5">
                      {asistenciaByGrupo[grupo].map((entry) => (
                        <div
                          className="grid grid-cols-[minmax(160px,1fr)_130px_90px_90px] items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-2 py-1.5"
                          key={entry.id}
                        >
                          <span className="truncate text-sm text-metro-text" title={entry.nombre}>
                            {entry.nombre}
                            {entry.organizacion && (
                              <span className="ml-1 text-xs text-metro-muted">
                                ({entry.organizacion})
                              </span>
                            )}
                          </span>
                          <Select
                            onChange={(event) =>
                              void commit(
                                withUpdatedAsistenciaEntry(entry.id, {
                                  estado: event.target.value as typeof entry.estado,
                                }),
                              )
                            }
                            value={entry.estado}
                          >
                            <option value="presente">Presente</option>
                            <option value="ausente">Ausente</option>
                            <option value="suplencia">Suplencia</option>
                          </Select>
                          <Input
                            onChange={(event) =>
                              void commit(
                                withUpdatedAsistenciaEntry(entry.id, {
                                  horaEntrada: event.target.value,
                                }),
                              )
                            }
                            placeholder="Entrada"
                            type="time"
                            value={entry.horaEntrada}
                          />
                          <Input
                            onChange={(event) =>
                              void commit(
                                withUpdatedAsistenciaEntry(entry.id, {
                                  horaSalida: event.target.value,
                                }),
                              )
                            }
                            placeholder="Salida"
                            type="time"
                            value={entry.horaSalida}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </section>

            {/* Puntos del día */}
            <section className={sectionClassName()}>
              <h4 className={sectionTitleClassName()}>Puntos del día</h4>
              <div className="space-y-3">
                {contenido.puntos.map((punto, index) => (
                  <div
                    className="space-y-2 rounded-lg border border-metro-border bg-metro-surface p-3"
                    key={punto.id}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-xs font-bold text-metro-muted">
                        {index + 1}.
                      </span>
                      <Input
                        className="flex-1"
                        onChange={(event) =>
                          void commit(withUpdatedPunto(punto.id, { titulo: event.target.value }))
                        }
                        value={punto.titulo}
                      />
                      <Select
                        className="w-48 shrink-0"
                        onChange={(event) =>
                          void commit(
                            withUpdatedPunto(punto.id, {
                              resultado: event.target.value as ActaPuntoResultado,
                            }),
                          )
                        }
                        value={punto.resultado}
                      >
                        {ACTA_PUNTO_RESULTADOS.map((resultado) => (
                          <option key={resultado} value={resultado}>
                            {RESULTADO_LABELS[resultado]}
                          </option>
                        ))}
                      </Select>
                      <ActionButton
                        disabled={index === 0}
                        onClick={() => void commit(withMovedPunto(punto.id, 'up'))}
                        size="sm"
                        title="Subir punto"
                        variant="secondary"
                      >
                        <ChevronUp size={14} />
                      </ActionButton>
                      <ActionButton
                        disabled={index === contenido.puntos.length - 1}
                        onClick={() => void commit(withMovedPunto(punto.id, 'down'))}
                        size="sm"
                        title="Bajar punto"
                        variant="secondary"
                      >
                        <ChevronDown size={14} />
                      </ActionButton>
                      <ActionButton
                        onClick={() => togglePunto(punto.id)}
                        size="sm"
                        title={collapsedPuntos.has(punto.id) ? 'Mostrar punto' : 'Plegar punto'}
                        variant="secondary"
                      >
                        {collapsedPuntos.has(punto.id) ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronUp size={14} />
                        )}
                      </ActionButton>
                      <ActionButton
                        onClick={() => void commit(withRemovedPunto(punto.id))}
                        size="sm"
                        title="Eliminar punto"
                        variant="delete"
                      />
                    </div>
                    {!collapsedPuntos.has(punto.id) && (
                      <>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            'La RD expone que ',
                            'La representación social solicita que ',
                            'Tras un intercambio de opiniones, ',
                            'Se acuerda ',
                            'No se alcanza acuerdo.',
                          ].map((texto) => (
                            <button
                              className="rounded-full border border-metro-border bg-metro-panel px-2.5 py-1 text-xs font-semibold text-metro-muted hover:bg-metro-soft hover:text-metro-text"
                              key={texto}
                              onClick={() =>
                                void commit(
                                  withUpdatedPunto(punto.id, {
                                    contenido: `${punto.contenido}${punto.contenido ? '<p><br></p>' : ''}<p>${texto}</p>`,
                                  }),
                                )
                              }
                              type="button"
                            >
                              {texto.trim()}
                            </button>
                          ))}
                        </div>
                        <RichTextEditor
                          onChange={(html) =>
                            void commit(withUpdatedPunto(punto.id, { contenido: html }))
                          }
                          placeholder="Qué se trató en este punto..."
                          value={punto.contenido}
                        />
                        <div className="flex gap-2">
                          <ActionButton
                            onClick={() =>
                              void commit(
                                withAddedAcuerdo({
                                  puntoId: punto.id,
                                  descripcion: '',
                                  responsable: '',
                                  fechaLimite: '',
                                  estado: 'pendiente',
                                }),
                              )
                            }
                            size="sm"
                            title="Añadir acuerdo para este punto"
                            variant="secondary"
                          >
                            <Plus size={13} />
                            Acuerdo
                          </ActionButton>
                          <ActionButton
                            onClick={() =>
                              void commit(
                                withAddedVotacion({
                                  puntoId: punto.id,
                                  tema: punto.titulo,
                                  posiciones: [],
                                }),
                              )
                            }
                            size="sm"
                            title="Añadir votación para este punto"
                            variant="secondary"
                          >
                            <Plus size={13} />
                            Votación
                          </ActionButton>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  onChange={(event) => setNuevoPuntoTitulo(event.target.value)}
                  placeholder="Nuevo punto del día..."
                  value={nuevoPuntoTitulo}
                />
                <ActionButton
                  onClick={() => {
                    if (!nuevoPuntoTitulo.trim()) {
                      return;
                    }
                    void commit(
                      withAddedPunto({
                        taskId: null,
                        titulo: nuevoPuntoTitulo.trim(),
                        contenido: '',
                        resultado: 'sin_resolver',
                      }),
                    );
                    setNuevoPuntoTitulo('');
                  }}
                  size="sm"
                  title="Añadir punto"
                  variant="add"
                >
                  Añadir punto
                </ActionButton>
              </div>
            </section>

            {/* Acuerdos */}
            {contenido.acuerdos.length > 0 && (
              <section className={sectionClassName()}>
                <h4 className={sectionTitleClassName()}>Acuerdos y compromisos</h4>
                {contenido.acuerdos.map((acuerdo) => {
                  const punto = contenido.puntos.find((p) => p.id === acuerdo.puntoId);
                  return (
                    <div
                      className="space-y-2 rounded-lg border border-metro-border bg-metro-surface p-3"
                      key={acuerdo.id}
                    >
                      <p className="text-xs font-semibold text-metro-muted">
                        {punto?.titulo ?? 'Punto eliminado'}
                      </p>
                      <Textarea
                        onChange={(event) =>
                          void commit(
                            withUpdatedAcuerdo(acuerdo.id, { descripcion: event.target.value }),
                          )
                        }
                        placeholder="Descripción del compromiso..."
                        rows={2}
                        value={acuerdo.descripcion}
                      />
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Input
                          onChange={(event) =>
                            void commit(
                              withUpdatedAcuerdo(acuerdo.id, { responsable: event.target.value }),
                            )
                          }
                          placeholder="Responsable"
                          value={acuerdo.responsable}
                        />
                        <Input
                          onChange={(event) =>
                            void commit(
                              withUpdatedAcuerdo(acuerdo.id, { fechaLimite: event.target.value }),
                            )
                          }
                          type="date"
                          value={acuerdo.fechaLimite}
                        />
                        <div className="flex items-center gap-2">
                          <Select
                            onChange={(event) =>
                              void commit(
                                withUpdatedAcuerdo(acuerdo.id, {
                                  estado: event.target.value as ActaAcuerdoEstado,
                                }),
                              )
                            }
                            value={acuerdo.estado}
                          >
                            {ACTA_ACUERDO_ESTADOS.map((estado) => (
                              <option key={estado} value={estado}>
                                {ACUERDO_ESTADO_LABELS[estado]}
                              </option>
                            ))}
                          </Select>
                          <ActionButton
                            onClick={() => void commit(withRemovedAcuerdo(acuerdo.id))}
                            size="sm"
                            title="Eliminar acuerdo"
                            variant="delete"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {/* Votaciones */}
            {contenido.votaciones.length > 0 && (
              <section className={sectionClassName()}>
                <h4 className={sectionTitleClassName()}>Votaciones</h4>
                {contenido.votaciones.map((votacion) => {
                  const summary = summarizeVotacionPosiciones(votacion);
                  return (
                    <div
                      className="space-y-2 rounded-lg border border-metro-border bg-metro-surface p-3"
                      key={votacion.id}
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          className="flex-1"
                          onChange={(event) =>
                            void commit((c) => ({
                              ...c,
                              votaciones: c.votaciones.map((v) =>
                                v.id === votacion.id ? { ...v, tema: event.target.value } : v,
                              ),
                            }))
                          }
                          value={votacion.tema}
                        />
                        <ActionButton
                          onClick={() => void commit(withRemovedVotacion(votacion.id))}
                          size="sm"
                          title="Eliminar votación"
                          variant="delete"
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(Object.keys(summary) as VotacionPosicion[])
                          .filter((posicion) => summary[posicion] > 0)
                          .map((posicion) => (
                            <StatusBadge
                              key={posicion}
                              size="xs"
                              tone={
                                posicion === 'favor'
                                  ? 'success'
                                  : posicion === 'contra'
                                    ? 'error'
                                    : 'muted'
                              }
                            >
                              {VOTACION_POSICION_LABELS[posicion]}: {summary[posicion]}
                            </StatusBadge>
                          ))}
                      </div>
                      {sindicatosDelCenso.length === 0 ? (
                        <Notice tone="info">
                          No hay sindicatos dados de alta en el censo — da de alta el censo para
                          poder registrar posiciones de voto.
                        </Notice>
                      ) : (
                        <div className="space-y-1.5">
                          {sindicatosDelCenso.map((miembro) => {
                            const posicionActual = votacion.posiciones.find(
                              (p) => p.organizacion === miembro.organizacion,
                            );
                            return (
                              <VotacionPosicionRow
                                censoOrganizacion={miembro.organizacion}
                                key={miembro.organizacion}
                                onChange={(patch) =>
                                  void commit(
                                    withUpsertedVotacionPosicion(
                                      votacion.id,
                                      miembro.organizacion,
                                      patch,
                                    ),
                                  )
                                }
                                posicion={posicionActual}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}

function VotacionPosicionRow({
  censoOrganizacion,
  onChange,
  posicion,
}: {
  censoOrganizacion: string;
  onChange: (patch: {
    posicion: VotacionPosicion;
    fecha?: string | null;
    observacion?: string;
  }) => void;
  posicion: { posicion: VotacionPosicion; fecha: string | null; observacion: string } | undefined;
}) {
  const current = posicion ?? { posicion: 'pendiente' as const, fecha: null, observacion: '' };

  return (
    <div className="grid grid-cols-[100px_150px_1fr] items-center gap-2">
      <span className="text-xs font-semibold text-metro-text">{censoOrganizacion}</span>
      <Select
        onChange={(event) => onChange({ posicion: event.target.value as VotacionPosicion })}
        value={current.posicion}
      >
        {VOTACION_POSICIONES.map((value) => (
          <option key={value} value={value}>
            {VOTACION_POSICION_LABELS[value]}
          </option>
        ))}
      </Select>
      <Input
        onChange={(event) =>
          onChange({ posicion: current.posicion, observacion: event.target.value })
        }
        placeholder="Observación (p. ej. mediante email)"
        value={current.observacion}
      />
    </div>
  );
}
