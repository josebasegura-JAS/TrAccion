import { CalendarClock, Eye, FolderOpen } from 'lucide-react';
import { AuditHistoryButton } from '../../../shared/audit/AuditHistoryButton';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { ModalDatabaseStatus } from '../../../components/ModalDatabaseStatus';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Field, Input, ReadonlyValue, Select, Textarea } from '../../../components/ui/Field';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { RecordLockNotice } from '../../../components/ui/RecordLockNotice';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import {
  type Acta,
  type ActaAlegacion,
  type ActaDraft,
  type ActaTypeDefinition,
} from '../domain/acta';
import {
  createEmptyAlegacion,
  formatDate,
  formatDateTime,
  getNextState,
  getNextStateLabel,
} from './actasPage.helpers';

export function ActaEditorModal({
  addDraftUpdate,
  advanceState,
  applyStateChange,
  canAttachFinalActa,
  canCreateOutlookDraftFromEditor,
  createActaOutlookCalendar,
  createActaOutlookDraft,
  deadlineWasAutoUpdated,
  displayedCreationDate,
  draft,
  editingActa,
  editingActaId,
  isEditorReadOnly,
  isClosedActa,
  newUpdateText,
  onClose,
  openActaPath,
  outlookDraftStatus,
  outlookDraftStatusIsError,
  pathStatus,
  pathStatusIsError,
  reopenActa,
  recordLock,
  saveActa,
  saveError,
  selectActaPath,
  selectableActaTypes,
  setNewUpdateText,
  sindicatoOptions,
  updateAlegacion,
  updateDraft,
}: {
  addDraftUpdate: () => void;
  advanceState: () => void;
  applyStateChange: (nextState: ActaDraft['estado']) => void;
  canAttachFinalActa: boolean;
  canCreateOutlookDraftFromEditor: boolean;
  createActaOutlookCalendar: (acta: Pick<Acta, 'titulo' | 'fechaLimite'>) => Promise<void>;
  createActaOutlookDraft: (
    acta: Pick<Acta, 'titulo' | 'tipo' | 'fechaSesion' | 'fechaLimite'>,
  ) => Promise<void>;
  deadlineWasAutoUpdated: boolean;
  displayedCreationDate: string;
  draft: ActaDraft;
  editingActa: Acta | null | undefined;
  editingActaId: string | null;
  isEditorReadOnly: boolean;
  isClosedActa: boolean;
  newUpdateText: string;
  onClose: () => void;
  openActaPath: () => Promise<void>;
  outlookDraftStatus: string;
  outlookDraftStatusIsError: boolean;
  pathStatus: string;
  pathStatusIsError: boolean;
  reopenActa: () => Promise<void>;
  recordLock: ReturnType<typeof useSharedRecordLock>;
  saveActa: () => Promise<void>;
  saveError: string;
  selectActaPath: () => Promise<void>;
  selectableActaTypes: ActaTypeDefinition[];
  setNewUpdateText: (value: string) => void;
  sindicatoOptions: string[];
  updateAlegacion: <K extends keyof ActaAlegacion>(
    index: number,
    key: K,
    value: ActaAlegacion[K],
  ) => void;
  updateDraft: <K extends keyof ActaDraft>(key: K, value: ActaDraft[K]) => void;
}) {
  return (
    <ModalShell labelledBy="actas-editor-title" maxWidthClassName="max-w-5xl" onClose={onClose}>
      <ModalHeader>
        <ModalTitle id="actas-editor-title" subtitle={`Estado actual: ${draft.estado}`}>
          {editingActaId ? 'Editar acta' : 'Nueva acta'}
        </ModalTitle>
        <div className="flex shrink-0 items-center gap-2">
          <ModalDatabaseStatus />
          <ModalCloseButton onClick={onClose} />
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4">
          {recordLock.status === 'locked' && recordLock.lockedBy && (
            <RecordLockNotice lockedBy={recordLock.lockedBy} />
          )}
          {isClosedActa && (
            <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Acta cerrada: se muestra en modo consulta para proteger el histórico. Reábrela si necesitas modificarla.
            </div>
          )}
          <div className="grid gap-2 xl:grid-cols-[150px_150px_170px_190px_minmax(220px,1fr)]">
            <Field label="Tipo">
              <Select
                className="mt-1 bg-metro-panel"
                onChange={(event) => updateDraft('tipo', event.target.value)}
                value={draft.tipo}
              >
                {selectableActaTypes.map((type) => (
                  <option key={type.id} value={type.nombre}>
                    {type.nombre}
                    {type.disabled ? ' (deshabilitado)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha sesión" required>
              <Input
                className="bg-metro-panel"
                onChange={(event) => updateDraft('fechaSesion', event.target.value)}
                required
                type="date"
                value={draft.fechaSesion}
              />
            </Field>
            <Field label="Fecha creación">
              <ReadonlyValue className="bg-metro-panel">{formatDate(displayedCreationDate)}</ReadonlyValue>
            </Field>
            <Field label="Fecha límite">
              <span className="relative block">
                <Input
                  className="bg-metro-panel pr-9"
                  onChange={(event) => updateDraft('fechaLimite', event.target.value)}
                  title="Fecha límite"
                  type="date"
                  value={draft.fechaLimite}
                />
                {deadlineWasAutoUpdated && (
                  <CalendarClock
                    aria-label="Fecha límite recalculada automáticamente"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-metro-red"
                    size={16}
                  />
                )}
              </span>
            </Field>
            <Field label="Título" required>
              <Input
                className="bg-metro-panel"
                onChange={(event) => updateDraft('titulo', event.target.value)}
                placeholder="Título"
                required
                value={draft.titulo}
              />
            </Field>
          </div>

          <div className="grid gap-2 xl:grid-cols-[260px_minmax(220px,1fr)]">
            <div className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-metro-muted">Estado actual</p>
              <p className="mt-0.5 text-sm font-bold text-metro-text">{draft.estado}</p>
            </div>
            <ActionButton
              disabled={!editingActaId || !getNextState(draft.estado) || isEditorReadOnly}
              iconOnly={false}
              onClick={advanceState}
              variant="secondary"
            >
              {getNextStateLabel(draft.estado)}
            </ActionButton>
          </div>

          <Textarea
            className="mt-0 min-h-[120px] bg-metro-panel"
            onChange={(event) => updateDraft('observaciones', event.target.value)}
            placeholder="Observaciones"
            value={draft.observaciones}
          />

          <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-metro-muted">
                Actualizaciones
              </h4>
              <span className="text-xs text-metro-muted">
                {draft.actualizaciones.length} registro(s)
              </span>
            </div>
            <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(220px,1fr)_140px]">
              <Input
                className="mt-0"
                onChange={(event) => setNewUpdateText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addDraftUpdate();
                  }
                }}
                placeholder="Nueva actualización..."
                value={newUpdateText}
              />
              <ActionButton iconOnly={false} onClick={addDraftUpdate} variant="add">
                Añadir
              </ActionButton>
            </div>
            <div className="mt-3 max-h-36 space-y-2 overflow-y-auto pr-1">
              {draft.actualizaciones.length === 0 && (
                <p className="text-sm text-metro-muted">Sin actualizaciones.</p>
              )}
              {draft.actualizaciones.map((entry) => (
                <div
                  className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2"
                  key={entry.id}
                >
                  <p className="text-xs font-semibold text-metro-muted">
                    {formatDateTime(entry.fecha)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-metro-text">{entry.texto}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-metro-muted">
                Alegaciones
              </h4>
              <ActionButton
                iconOnly={false}
                onClick={() =>
                  updateDraft('alegaciones', [...draft.alegaciones, createEmptyAlegacion()])
                }
                size="sm"
                variant="add"
              >
                Añadir sindicato
              </ActionButton>
            </div>
            <div className="mt-3 space-y-2">
              {draft.alegaciones.length === 0 && (
                <p className="text-sm text-metro-muted">Sin alegaciones configuradas.</p>
              )}
              {draft.alegaciones.map((alegacion, index) => (
                <div
                  className="grid gap-2 rounded-lg border border-metro-border bg-metro-surface p-2 xl:grid-cols-[180px_110px_150px_minmax(220px,1fr)_80px]"
                  key={`${alegacion.sindicato}-${index}`}
                >
                  <Input
                    className="mt-0 bg-metro-panel"
                    list="actas-sindicatos"
                    onChange={(event) => updateAlegacion(index, 'sindicato', event.target.value)}
                    placeholder="Sindicato"
                    value={alegacion.sindicato}
                  />
                  <label className="flex items-center gap-2 text-sm text-metro-muted">
                    <input
                      checked={alegacion.presentada}
                      onChange={(event) =>
                        updateAlegacion(index, 'presentada', event.target.checked)
                      }
                      type="checkbox"
                    />
                    Presentada
                  </label>
                  <Input
                    className="mt-0 bg-metro-panel"
                    onChange={(event) => updateAlegacion(index, 'fecha', event.target.value)}
                    type="date"
                    value={alegacion.fecha}
                  />
                  <Input
                    className="mt-0 bg-metro-panel"
                    onChange={(event) => updateAlegacion(index, 'observacion', event.target.value)}
                    placeholder="Observación"
                    value={alegacion.observacion}
                  />
                  <ActionButton
                    iconOnly={false}
                    onClick={() =>
                      updateDraft(
                        'alegaciones',
                        draft.alegaciones.filter((_, currentIndex) => currentIndex !== index),
                      )
                    }
                    size="sm"
                    variant="delete"
                  >
                    Quitar
                  </ActionButton>
                </div>
              ))}
            </div>
            <datalist id="actas-sindicatos">
              {sindicatoOptions.map((sindicato) => (
                <option key={sindicato} value={sindicato} />
              ))}
            </datalist>
          </div>

          <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-metro-muted">
                  Acta firmada
                </h4>
                <p className="text-xs text-metro-muted">
                  Se habilita en estado Pendiente de firma para vincular la ruta de red del acta.
                </p>
              </div>
              {!canAttachFinalActa && (
                <StatusBadge tone="muted">Disponible al pasar a firma</StatusBadge>
              )}
            </div>
            <div className="mt-3 grid gap-2 xl:grid-cols-[minmax(220px,1fr)_120px_120px]">
              <Input
                className="mt-0"
                disabled={!canAttachFinalActa}
                onChange={(event) => updateDraft('actaPath', event.target.value)}
                placeholder="Ruta de red del acta firmada..."
                value={draft.actaPath}
              />
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canAttachFinalActa}
                onClick={() => void selectActaPath()}
                type="button"
              >
                <FolderOpen size={15} /> Ruta
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-metro-border px-3 py-2 text-sm font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canAttachFinalActa || !draft.actaPath.trim()}
                onClick={() => void openActaPath()}
                type="button"
              >
                <Eye size={15} /> Ver
              </button>
            </div>
            {pathStatus && (
              <p
                className={`mt-2 text-xs ${pathStatusIsError ? 'text-red-200' : 'text-metro-muted'}`}
              >
                {pathStatus}
              </p>
            )}
          </div>
      </ModalBody>

      {outlookDraftStatus && (
          <p
            className={`mx-4 rounded-lg border px-3 py-2 text-xs font-semibold ${outlookDraftStatusIsError ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}
          >
            {outlookDraftStatus}
          </p>
        )}

        {saveError && (
          <p className="mx-4 rounded-lg border border-metro-red/40 bg-metro-red/10 px-3 py-2 text-xs font-semibold text-metro-red">
            {saveError}
          </p>
        )}
      <ModalFooter>
          <ActionButton iconOnly={false} onClick={onClose} variant="secondary">
            Cancelar
          </ActionButton>
          {canAttachFinalActa && draft.estado !== 'Cerrada' && (
            <ActionButton
              iconOnly={false}
              onClick={() => applyStateChange('Cerrada')}
              variant="secondary"
            >
              Cerrar acta
            </ActionButton>
          )}
          {canCreateOutlookDraftFromEditor && (
            <ActionButton
              iconOnly={false}
              onClick={() => void createActaOutlookDraft(draft)}
              title="Abrir borrador Outlook de alegaciones"
              variant="outlook"
            >
              Borrador Outlook
            </ActionButton>
          )}
          {canCreateOutlookDraftFromEditor && (
            <ActionButton
              icon={CalendarClock}
              iconOnly={false}
              onClick={() => void createActaOutlookCalendar(draft)}
              title="Abrir cita Outlook para fin de alegaciones"
              variant="outlook"
            >
              Calendario
            </ActionButton>
          )}
          {isClosedActa ? (
            <ActionButton
              disabled={recordLock.isReadOnly}
              iconOnly={false}
              onClick={() => void reopenActa()}
              variant="secondary"
            >
              Reabrir acta
            </ActionButton>
          ) : (
            <ActionButton
              disabled={isEditorReadOnly}
              iconOnly={false}
              onClick={() => void saveActa()}
              variant="save"
            >
              Guardar acta
            </ActionButton>
          )}
          {editingActa && (
            <AuditHistoryButton
              entityId={editingActa.id}
              entityTitle={editingActa.titulo || 'Acta sin título'}
              module="actas"
            />
          )}
          <InlineSaveFeedback />
      </ModalFooter>
    </ModalShell>
  );
}
