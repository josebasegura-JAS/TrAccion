import {
  BookOpen,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  LockKeyhole,
  Printer,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { isTaskClosed, type Task, type TaskDraft } from '../features/tareas/domain/task';
import { buildTaskReportHtml, exportTaskReportToExcel } from '../features/tareas/export/taskReport';
import { TaskLinksSection } from '../features/task-links/components/TaskLinksSection';
import { AuditHistoryButton } from '../shared/audit/AuditHistoryButton';
import { PrintPreviewModal } from '../shared/print/PrintPreviewModal';
import { ActionButton } from './ui/ActionButton';
import { Textarea } from './ui/Field';
import { ModalCloseButton } from './ui/ModalCloseButton';
import { ModalHeader, ModalShell, ModalTitle } from './ui/ModalShell';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { InlineNotice } from './ui/InlineNotice';
import { ModalDatabaseStatus } from './ModalDatabaseStatus';
import { TaskAttachmentsSection } from './task-editor/TaskAttachmentsSection';
import { TaskCircuitsSection } from './task-editor/TaskCircuitsSection';
import { TaskEditorSection } from './task-editor/TaskEditorSection';
import { TaskGeneralFields } from './task-editor/TaskGeneralFields';
import { TaskStatusPanel } from './task-editor/TaskStatusPanel';
import { TaskTrackingSection } from './task-editor/TaskTrackingSection';
import { useTaskEditorController, type TaskCreateOverride } from './task-editor/useTaskEditorController';
import { useAppDialog } from '../hooks/useAppDialog';

export function TaskEditor({
  task,
  mode,
  onDone,
  initialDraft,
  initialTrackingText = '',
  onCreated,
  createTaskOverride,
}: {
  task: Task | null;
  mode: 'create' | 'edit';
  onDone: () => void;
  initialDraft?: Partial<TaskDraft>;
  initialTrackingText?: string;
  onCreated?: (taskId: string) => void | Promise<void>;
  createTaskOverride?: TaskCreateOverride;
}) {
  const [taskPrintPreviewHtml, setTaskPrintPreviewHtml] = useState<string | null>(null);
  const { confirm: confirmCloseTask, dialogNode: closeTaskDialogNode } = useAppDialog();
  const {
    areaCircuitOptions,
    canSubmit,
    cancelTrackingEdit,
    clearRecoveryDraft,
    creationDate,
    criterionLinkReady,
    criterionSaveDialogNode,
    customAreaTarget,
    dialogNode,
    documentStatus,
    draft,
    editingTrackingDate,
    editingTrackingId,
    editingTrackingText,
    handleAddDocument,
    handleDeleteTracking,
    completeQuickAction,
    handleCloseTask,
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
    quickActionEnabled, setQuickActionEnabled, quickActionTitle, setQuickActionTitle, quickActionDate, setQuickActionDate, quickActionAssignee, setQuickActionAssignee, quickActionAssigneeOptions,
    unionCircuitOptions,
  } = useTaskEditorController({ task, mode, onDone, initialDraft, initialTrackingText, onCreated, createTaskOverride });

  return (
    <>
      <ModalShell
        blockEditorShortcuts={false}
        labelledBy="task-editor-title"
        maxWidthClassName="max-w-[1660px]"
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
            {lockMessage && !isFormReadOnly && (
              <span
                className="hidden max-w-[14rem] items-center gap-1.5 truncate rounded-full border border-sky-400/20 bg-sky-950/20 px-2 py-1 text-[11px] font-medium text-sky-200/85 sm:inline-flex"
                title={lockMessage}
                role="status"
                aria-label={lockMessage}
              >
                <LockKeyhole size={12} aria-hidden="true" className="shrink-0" />
                <span className="truncate">Edición reservada</span>
              </span>
            )}
            <ModalDatabaseStatus />
            <ModalCloseButton label="Cerrar editor" onClick={() => void requestClose()} />
          </div>
        </ModalHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); void handleSubmit(); }}>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 lg:px-4">
            {lockMessage && isFormReadOnly && (
              <InlineNotice tone="warning"><strong className="font-semibold">Edición no disponible.</strong> {lockMessage}</InlineNotice>
            )}

            <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(310px,360px)] xl:grid-cols-[minmax(0,1fr)_minmax(330px,390px)]">
                <fieldset disabled={isFormReadOnly} className="min-w-0 space-y-3 border-0 p-0 disabled:opacity-70">
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
                <Textarea className="min-h-[85px] border-sky-200/15 bg-[#233b55]/60 text-sm leading-6" value={draft.descripcion} onChange={(e) => setDraft((current) => ({ ...current, descripcion: e.target.value }))} />
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
                quickActionEnabled={quickActionEnabled}
                setQuickActionEnabled={setQuickActionEnabled}
                quickActionTitle={quickActionTitle}
                setQuickActionTitle={setQuickActionTitle}
                quickActionDate={quickActionDate}
                setQuickActionDate={setQuickActionDate}
                quickActionAssignee={quickActionAssignee}
                setQuickActionAssignee={setQuickActionAssignee}
                quickActionAssigneeOptions={quickActionAssigneeOptions}
                onCompleteQuickAction={completeQuickAction}
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
                <aside className="min-w-0 space-y-3">
                  <fieldset disabled={isFormReadOnly} className="border-0 p-0 disabled:opacity-70"><TaskStatusPanel draft={draft} setDraft={setDraft} /></fieldset>
                  <section aria-label="Acciones rápidas" className="rounded-xl border border-sky-300/20 bg-[#102239]/90 p-3">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-100"><Zap aria-hidden="true" size={17} className="text-cyan-300" />Acciones rápidas</h3>
                    <div className="grid grid-cols-2 gap-2 [&_button]:min-w-0 [&_button]:w-full">
                      <ActionButton disabled={!canSubmit} type="submit" variant="save">Guardar</ActionButton>
                      <ActionButton onClick={() => void requestClose()} variant="secondary">Cancelar</ActionButton>
                      {!isCreate && task && !isTaskClosed(task) && (
                <ActionButton
                  disabled={isFormReadOnly}
                  icon={CheckCircle2}
                  iconOnly={false}
                  onClick={() => void (async () => {
                    const confirmed = await confirmCloseTask(
                      '¿Cerrar esta tarea?\n\nPasará al histórico y dejará de aparecer entre las tareas activas. El seguimiento y sus vínculos se conservarán.',
                      { confirmLabel: 'Cerrar tarea', cancelLabel: 'Cancelar', title: 'Cerrar tarea' },
                    );
                    if (confirmed) await handleCloseTask();
                  })()}
                  variant="approve"
                >
                  Cerrar tarea
                </ActionButton>
              )}
                      {!isCreate && task && <AuditHistoryButton className="px-2 w-full" entityId={task.id} entityTitle={task.titulo || 'Tarea sin título'} module="tareas" />}
                      {!isCreate && task && (
                <>
                  <ActionButton
                    icon={Printer}
                    iconOnly={false}
                    title="Imprimir"
                    onClick={() => setTaskPrintPreviewHtml(buildTaskReportHtml({ task, draft }))}
                    type="button"
                    variant="secondary"
                  />
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
                    Excel
                  </ActionButton>
                </>
              )}
                      <div className="col-span-2">{!isCreate && task && (
                <ActionButton
                  disabled={!criterionLinkReady || (isFormReadOnly && !linkedCriterionId)}
                  icon={BookOpen}
                  iconOnly={false}
                  onClick={() => void handleOpenCriterionRrll()}
                  variant="secondary"
                >
                  {!criterionLinkReady
                    ? 'Criterio…'
                    : 'Criterio RRLL'}
                </ActionButton>
              )}</div>
                      <div className="col-span-2 mt-1 border-t border-red-400/20 pt-2">              {!isCreate && task && (
                <ActionButton disabled={isFormReadOnly} iconOnly={false} variant="delete" onClick={() => void (async () => {
                  const result = await removeTask(task.id, loadedUpdatedAt);
                  if (!result.ok) { setSaveStatus(result.message); setSaveStatusIsError(true); return; }
                  clearRecoveryDraft(); onDone();
                })()}>Eliminar</ActionButton>
              )}
</div>
                      <div className="col-span-2"><InlineSaveFeedback /></div>
              {saveStatus && saveStatusIsError && (
                <p
                  className="col-span-2 break-words px-1 text-left text-[11px] font-semibold text-red-300"
                  title={saveStatus}
                >
                  {saveStatus}
                </p>
              )}


            </div>
          </div>
                    </div>
                  </section>
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


                </aside>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-sky-300/10 bg-[#0c1b2e]/95 px-4 py-2 lg:hidden">
            <InlineSaveFeedback />
            <div className="flex items-center gap-2">
              <ActionButton onClick={() => void requestClose()} variant="secondary">Cancelar</ActionButton>
              <ActionButton disabled={!canSubmit} type="submit" variant="save">Guardar</ActionButton>
            </div>
          </div>
        </form>
      </ModalShell>
      {dialogNode}
      {closeTaskDialogNode}
      {recoveryDialogNode}
      {criterionSaveDialogNode}
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
