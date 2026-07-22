import { CalendarClock, Eye, FolderOpen } from 'lucide-react';
import { AuditHistoryButton } from '../../../shared/audit/AuditHistoryButton';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { ModalDatabaseStatus } from '../../../components/ModalDatabaseStatus';
import { ActionButton } from '../../../components/ui/ActionButton';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalBody, ModalFooter, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { RecordLockNotice } from '../../../components/ui/RecordLockNotice';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useSharedRecordLock } from '../../../services/useSharedRecordLock';
import {
  ACTA_STATES,
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
  newUpdateText,
  onClose,
  openActaPath,
  outlookDraftStatus,
  outlookDraftStatusIsError,
  pathStatus,
  pathStatusIsError,
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
  newUpdateText: string;
  onClose: () => void;
  openActaPath: () => Promise<void>;
  outlookDraftStatus: string;
  outlookDraftStatusIsError: boolean;
  pathStatus: string;
  pathStatusIsError: boolean;
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
          <div className="grid gap-2 xl:grid-cols-[150px_150px_170px_190px_minmax(220px,1fr)]">
            <label className="flex flex-col gap-1 text-xs font-semibold text-metro-muted">
              Tipo
              <select
                className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => updateDraft('tipo', event.target.value)}
                value={draft.tipo}
              >
                {selectableActaTypes.map((type) => (
                  <option key={type.id} value={type.nombre}>
                    {type.nombre}
                    {type.disabled ? ' (deshabilitado)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-metro-muted">
              Fecha sesión
              <input
                className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => updateDraft('fechaSesion', event.target.value)}
                type="date"
                value={draft.fechaSesion}
              />
            </label>
            <div className="flex flex-col gap-1 text-xs font-semibold text-metro-muted">
              Fecha creación
              <div className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-metro-text">
                {formatDate(displayedCreationDate)}
              </div>
            </div>
            <label className="flex flex-col gap-1 text-xs font-semibold text-metro-muted">
              Fecha límite
              <span className="relative block">
                <input
                  className="w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 pr-9 text-sm font-normal normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
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
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-metro-muted">
              Título
              <input
                className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-normal normal-case tracking-normal text-metro-text outline-none focus:border-metro-red"
                onChange={(event) => updateDraft('titulo', event.target.value)}
                placeholder="Título"
                value={draft.titulo}
              />
            </label>
          </div>

          <div className="grid gap-2 xl:grid-cols-[260px_minmax(220px,1fr)]">
            <select
              className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => applyStateChange(event.target.value as ActaDraft['estado'])}
              value={draft.estado}
            >
              {ACTA_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
            <ActionButton
              disabled={!getNextState(draft.estado)}
              iconOnly={false}
              onClick={advanceState}
              variant="secondary"
            >
              {getNextStateLabel(draft.estado)}
            </ActionButton>
          </div>

          <textarea
            className="min-h-[120px] w-full rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
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
              <input
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red"
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
                  <input
                    className="rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
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
                  <input
                    className="rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
                    onChange={(event) => updateAlegacion(index, 'fecha', event.target.value)}
                    type="date"
                    value={alegacion.fecha}
                  />
                  <input
                    className="rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
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
              <input
                className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-text outline-none focus:border-metro-red disabled:cursor-not-allowed disabled:opacity-60"
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
          <ActionButton
            disabled={isEditorReadOnly}
            iconOnly={false}
            onClick={() => void saveActa()}
            variant="save"
          >
            Guardar acta
          </ActionButton>
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
