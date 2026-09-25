import {
  BookOpen,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Printer,
} from 'lucide-react';
import { useState } from 'react';
import { type Task, type TaskDraft } from '../features/tareas/domain/task';
import { buildTaskReportHtml, exportTaskReportToExcel } from '../features/tareas/export/taskReport';
import { TaskLinksSection } from '../features/task-links/components/TaskLinksSection';
import { AuditHistoryButton } from '../shared/audit/AuditHistoryButton';
import { PrintPreviewModal } from '../shared/print/PrintPreviewModal';
import { ActionButton } from './ui/ActionButton';
import { Textarea } from './ui/Field';
import { ModalCloseButton } from './ui/ModalCloseButton';
import { ModalHeader, ModalShell, ModalTitle } from './ui/ModalShell';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { ModalDatabaseStatus } from './ModalDatabaseStatus';
import { TaskAttachmentsSection } from './task-editor/TaskAttachmentsSection';
import { TaskCircuitsSection } from './task-editor/TaskCircuitsSection';
import { TaskEditorSection } from './task-editor/TaskEditorSection';
import { TaskGeneralFields } from './task-editor/TaskGeneralFields';
import { TaskTrackingSection } from './task-editor/TaskTrackingSection';
import { useTaskEditorController } from './task-editor/useTaskEditorController';

export function TaskEditor({
  task,
  mode,
  onDone,
  initialDraft,
  initialTrackingText = '',
  onCreated,
}: {
  task: Task | null;
  mode: 'create' | 'edit';
  onDone: () => void;
  initialDraft?: Partial<TaskDraft>;
  initialTrackingText?: string;
  onCreated?: (taskId: string) => void | Promise<void>;
}) {
  const [taskPrintPreviewHtml, setTaskPrintPreviewHtml] = useState<string | null>(null);
  const {
    areaCircuitOptions,
    canSubmit,
    cancelTrackingEdit,
    clearRecoveryDraft,
    creationDate,
    criterionLinkReady,
    customAreaTarget,
    dialogNode,
    documentStatus,
    draft,
    editingTrackingDate,
    editingTrackingId,
    editingTrackingText,
    handleAddDocument,
    handleDeleteTracking,
    handleImportMailFile,
    handleOpenCriterionRrll,
    handleSaveTrackingEdit,
    handleSelectDocument,
    handleSubmit,
    isCommitteeCircuit,
    isCreate,
    isFormReadOnly,
    isParitariaCircuit,
    isSavingTrackingEdit,
    linkedCriterionId,
    liveTask,
    loadedUpdatedAt,
    lockMessage,
    mailDragActive,
    mailStatus,
    manualDocumentPath,
    originOptions,
    otherResponsibleValue,
    phaseOptions,
    recoveryDialogNode,
    removeTask,
    requestClose,
    responsibleOptions,
    responsibleSelectValue,
    saveStatus,
    saveStatusIsError,
    selectedAreaTarget,
    selectedUnionOrigin,
    sendToDirection,
    sendToUnion,
    setCustomAreaTarget,
    setDraft,
    setEditingTrackingDate,
    setEditingTrackingText,
    setMailDragActive,
    setManualDocumentPath,
    setSaveStatus,
    setSaveStatusIsError,
    setSelectedAreaTarget,
    setSendToDirection,
    setSendToUnion,
    setShowCircuitPicker,
    setTrackingDate,
    setTrackingText,
    showCircuitPicker,
    startTrackingEdit,
    trackingDate,
    trackingDeleteDialogNode,
    trackingItems,
    trackingText,
    trackingUser,
    unionCircuitOptions,
  } = useTaskEditorController({ task, mode, onDone, initialDraft, initialTrackingText, onCreated });

  return (
    <>
      <ModalShell
        blockEditorShortcuts={false}
        labelledBy="task-editor-title"
        maxWidthClassName="max-w-[1080px]"
        onClose={() => void requestClose()}
        panelClassName="bg-[#0b1a2c]"
      >
        <ModalHeader>
          <ModalTitle
            id="task-editor-title"
            subtitle={isCreate ? 'Alta de nueva tarea' : `Editando tarea ${task?.id ?? '—'}`}
          >
            {isCreate ? 'Nueva tarea' : task?.titulo || 'Tarea'}
          </ModalTitle>
          <div className="flex shrink-0 items-center gap-2">
            <ModalDatabaseStatus />
            <ModalCloseButton label="Cerrar editor" onClick={() => void requestClose()} />
          </div>
        </ModalHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {lockMessage && (
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${isFormReadOnly ? 'border-red-400/30 bg-red-950/20 text-red-200' : 'border-amber-400/30 bg-amber-950/20 text-amber-200'}`}>
                <LockKeyhole size={15} />
                <span>{lockMessage}</span>
              </div>
            )}

            <fieldset disabled={isFormReadOnly} className="space-y-3 disabled:opacity-70">
              <TaskGeneralFields
                creationDate={creationDate}
                draft={draft}
                originOptions={originOptions}
                otherResponsibleValue={otherResponsibleValue}
                phaseOptions={phaseOptions}
                responsibleOptions={responsibleOptions}
                responsibleSelectValue={responsibleSelectValue}
                setDraft={setDraft}
                task={task}
              />

              <TaskEditorSection icon={FileText} title="Descripción">
                <Textarea className="min-h-20" value={draft.descripcion} onChange={(e) => setDraft((current) => ({ ...current, descripcion: e.target.value }))} />
              </TaskEditorSection>

              <TaskTrackingSection
                editingTrackingDate={editingTrackingDate}
                editingTrackingId={editingTrackingId}
                editingTrackingText={editingTrackingText}
                isFormReadOnly={isFormReadOnly}
                isSavingTrackingEdit={isSavingTrackingEdit}
                onCancelTrackingEdit={cancelTrackingEdit}
                onDeleteTracking={handleDeleteTracking}
                onSaveTrackingEdit={handleSaveTrackingEdit}
                onStartTrackingEdit={startTrackingEdit}
                setEditingTrackingDate={setEditingTrackingDate}
                setEditingTrackingText={setEditingTrackingText}
                setTrackingDate={setTrackingDate}
                setTrackingText={setTrackingText}
                task={task}
                trackingDate={trackingDate}
                trackingItems={trackingItems}
                trackingText={trackingText}
                trackingUser={trackingUser}
              />

              {!isCreate && task && <TaskLinksSection task={liveTask ?? task} />}

              <TaskCircuitsSection
                areaCircuitOptions={areaCircuitOptions}
                customAreaTarget={customAreaTarget}
                draft={draft}
                isCommitteeCircuit={isCommitteeCircuit}
                isParitariaCircuit={isParitariaCircuit}
                selectedAreaTarget={selectedAreaTarget}
                selectedUnionOrigin={selectedUnionOrigin}
                sendToDirection={sendToDirection}
                sendToUnion={sendToUnion}
                setCustomAreaTarget={setCustomAreaTarget}
                setDraft={setDraft}
                setSelectedAreaTarget={setSelectedAreaTarget}
                setSendToDirection={setSendToDirection}
                setSendToUnion={setSendToUnion}
                setShowCircuitPicker={setShowCircuitPicker}
                showCircuitPicker={showCircuitPicker}
                unionCircuitOptions={unionCircuitOptions}
              />

              <TaskAttachmentsSection
                documentStatus={documentStatus}
                draft={draft}
                isFormReadOnly={isFormReadOnly}
                mailDragActive={mailDragActive}
                mailStatus={mailStatus}
                manualDocumentPath={manualDocumentPath}
                onAddDocument={handleAddDocument}
                onImportMailFile={handleImportMailFile}
                onSelectDocument={handleSelectDocument}
                setDraft={setDraft}
                setMailDragActive={setMailDragActive}
                setManualDocumentPath={setManualDocumentPath}
              />

              <TaskEditorSection icon={FileText} title="Observaciones">
                <Textarea className="min-h-16" value={draft.observaciones} onChange={(e) => setDraft((current) => ({ ...current, observaciones: e.target.value }))} />
              </TaskEditorSection>
            </fieldset>
          </div>

          <div className="shrink-0 border-t border-sky-300/10 bg-[#0c1b2e]/95 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton disabled={!canSubmit} iconOnly={false} type="submit" variant="save">Guardar <kbd className="ml-1 text-[10px] opacity-70">Ctrl S</kbd></ActionButton>
              <InlineSaveFeedback />
              {!isCreate && task && (
                <>
                  <ActionButton
                    icon={Printer}
                    iconOnly={false}
                    onClick={() => setTaskPrintPreviewHtml(buildTaskReportHtml({ task, draft }))}
                    type="button"
                    variant="secondary"
                  >
                    Imprimir
                  </ActionButton>
                  <ActionButton
                    icon={FileSpreadsheet}
                    iconOnly={false}
                    onClick={() => void exportTaskReportToExcel({ task, draft }).catch((error) => {
                      setSaveStatus(error instanceof Error ? error.message : 'No se ha podido generar el Excel.');
                      setSaveStatusIsError(true);
                    })}
                    type="button"
                    variant="secondary"
                  >
                    Exportar Excel
                  </ActionButton>
                </>
              )}
              {!isCreate && task && <AuditHistoryButton entityId={task.id} entityTitle={task.titulo || 'Tarea sin título'} module="tareas" />}
              {!isCreate && task && (
                <ActionButton
                  disabled={!criterionLinkReady || (isFormReadOnly && !linkedCriterionId)}
                  icon={BookOpen}
                  iconOnly={false}
                  onClick={() => void handleOpenCriterionRrll()}
                  variant="secondary"
                >
                  {!criterionLinkReady
                    ? 'Comprobando criterio…'
                    : linkedCriterionId
                      ? 'Ver criterio RRLL'
                      : 'Crear criterio RRLL'}
                </ActionButton>
              )}
              {!isCreate && task && (
                <ActionButton disabled={isFormReadOnly} iconOnly={false} variant="delete" onClick={() => void (async () => {
                  const result = await removeTask(task.id, loadedUpdatedAt);
                  if (!result.ok) { setSaveStatus(result.message); setSaveStatusIsError(true); return; }
                  clearRecoveryDraft(); onDone();
                })()}>Eliminar</ActionButton>
              )}
              <button className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-muted hover:text-white" onClick={() => void requestClose()} type="button">Cancelar <kbd className="ml-1 text-[10px] opacity-70">Esc</kbd></button>
              {saveStatus && <p className={`ml-auto text-xs font-semibold ${saveStatusIsError ? 'text-red-300' : 'text-slate-400'}`}>{saveStatus}</p>}
            </div>
          </div>
        </form>
      </ModalShell>
      {dialogNode}
      {recoveryDialogNode}
      {trackingDeleteDialogNode}
      {taskPrintPreviewHtml && (
        <PrintPreviewModal
          html={taskPrintPreviewHtml}
          onClose={() => setTaskPrintPreviewHtml(null)}
          title="Detalle de tarea"
        />
      )}
    </>
  );
}
