import { HuelgasOverview } from './HuelgasOverview';
import { HuelgaEditorModal } from './HuelgaEditorModal';
import { HuelgaImportModal } from './HuelgaImportModal';
import { HuelgasAssignmentModals } from './HuelgasAssignmentModals';
import { HuelgasZonesModals } from './HuelgasZonesModals';
import { HuelgasCollectionMailsModal } from './HuelgasCollectionMailsModal';
import { useHuelgasPageController } from './useHuelgasPageController';

export function HuelgasPage() {
  const {
    huelgas,
    sortedHuelgas,
    nextHuelga,
    puestoResponsables,
    zonas,
    areas,
    generatingCollectionForId,
    openZones,
    openNew,
    openEdit,
    openImport,
    openAssignments,
    openCollectionMails,
    remove,
    importTarget,
    importFileName,
    importPreview,
    importSkippedRows,
    importPlantillaStats,
    importError,
    importing,
    employeesLoading,
    employees,
    closeImport,
    selectImportFile,
    saveImportedPersonal,
    assignmentTarget,
    assignmentDraft,
    assignmentConfiguredCount,
    assignmentSearch,
    setAssignmentSearch,
    assignmentFilters,
    assignmentSort,
    filteredAssignmentDraft,
    assignmentPersonCounts,
    savingAssignments,
    personDetailAssignment,
    personDetailRows,
    personResidenceDrafts,
    setPersonResidenceDrafts,
    savingPersonId,
    closeAssignments,
    toggleAssignmentSort,
    updateAssignmentFilter,
    updateAssignmentResidence,
    updateAssignment,
    openPersonDetail,
    closePersonDetail,
    savePersonResidence,
    saveAssignments,
    zonesOpen,
    zoneDraft,
    areaDraft,
    newZoneName,
    setNewZoneName,
    newAreaName,
    setNewAreaName,
    newAreaZoneId,
    setNewAreaZoneId,
    savingZones,
    mailTemplateZone,
    setMailTemplateZoneId,
    closeZones,
    addZone,
    updateZone,
    addArea,
    updateArea,
    saveZones,
    mailTarget,
    mailGroups,
    mailPreviewZoneId,
    setMailPreviewZoneId,
    mailPreviewGroup,
    currentMailPreview,
    mailSpecificNotes,
    setMailSpecificNotes,
    closeCollectionMails,
    saveMailSpecificNotes,
    generateSingleCollectionMail,
    generateAllCollectionMails,
    editorOpen,
    editingId,
    draft,
    sindicatos,
    saving,
    setEditorOpen,
    setDraft,
    toggleSindicato,
    addTramo,
    updateTramo,
    removeTramo,
    save,
    dialogNode,
  } = useHuelgasPageController();

  return (
    <div className="ui3-huelgas space-y-3">
      <HuelgasOverview
        huelgas={huelgas}
        sortedHuelgas={sortedHuelgas}
        nextHuelga={nextHuelga ?? null}
        puestoResponsables={puestoResponsables}
        zonas={zonas}
        areas={areas}
        generatingCollectionForId={generatingCollectionForId}
        onOpenZones={openZones}
        onOpenNew={openNew}
        onOpenEdit={openEdit}
        onOpenImport={openImport}
        onOpenAssignments={openAssignments}
        onOpenCollectionMails={(huelga) => void openCollectionMails(huelga)}
        onRemove={(huelga) => void remove(huelga)}
      />

      <HuelgaImportModal
        importTarget={importTarget}
        importFileName={importFileName}
        importPreview={importPreview}
        importSkippedRows={importSkippedRows}
        importPlantillaStats={importPlantillaStats}
        importError={importError}
        importing={importing}
        employeesLoading={employeesLoading}
        employees={employees}
        onClose={closeImport}
        onSelectFile={(file) => void selectImportFile(file)}
        onSave={() => void saveImportedPersonal()}
      />      <HuelgasAssignmentModals
        assignmentTarget={assignmentTarget}
        assignmentDraft={assignmentDraft}
        assignmentConfiguredCount={assignmentConfiguredCount}
        assignmentSearch={assignmentSearch}
        setAssignmentSearch={setAssignmentSearch}
        assignmentFilters={assignmentFilters}
        assignmentSort={assignmentSort}
        filteredAssignmentDraft={filteredAssignmentDraft}
        assignmentPersonCounts={assignmentPersonCounts}
        zonas={zonas}
        areas={areas}
        savingAssignments={savingAssignments}
        personDetailAssignment={personDetailAssignment}
        personDetailRows={personDetailRows}
        employees={employees}
        personResidenceDrafts={personResidenceDrafts}
        setPersonResidenceDrafts={setPersonResidenceDrafts}
        savingPersonId={savingPersonId}
        onOpenZones={openZones}
        onCloseAssignments={closeAssignments}
        onToggleAssignmentSort={toggleAssignmentSort}
        onUpdateAssignmentFilter={updateAssignmentFilter}
        onUpdateAssignmentResidence={updateAssignmentResidence}
        onUpdateAssignment={updateAssignment}
        onOpenPersonDetail={openPersonDetail}
        onClosePersonDetail={closePersonDetail}
        onSavePersonResidence={(persona) => void savePersonResidence(persona)}
        onSaveAssignments={() => void saveAssignments()}
      />

      <HuelgasZonesModals
        zonesOpen={zonesOpen}
        zoneDraft={zoneDraft}
        areaDraft={areaDraft}
        newZoneName={newZoneName}
        setNewZoneName={setNewZoneName}
        newAreaName={newAreaName}
        setNewAreaName={setNewAreaName}
        newAreaZoneId={newAreaZoneId}
        setNewAreaZoneId={setNewAreaZoneId}
        savingZones={savingZones}
        mailTemplateZone={mailTemplateZone}
        setMailTemplateZoneId={setMailTemplateZoneId}
        onCloseZones={closeZones}
        onAddZone={addZone}
        onUpdateZone={updateZone}
        onAddArea={addArea}
        onUpdateArea={updateArea}
        onSaveZones={() => void saveZones()}
      />

      <HuelgasCollectionMailsModal
        mailTarget={mailTarget}
        mailGroups={mailGroups}
        zonas={zonas}
        mailPreviewZoneId={mailPreviewZoneId}
        setMailPreviewZoneId={setMailPreviewZoneId}
        mailPreviewGroup={mailPreviewGroup}
        currentMailPreview={currentMailPreview}
        mailSpecificNotes={mailSpecificNotes}
        setMailSpecificNotes={setMailSpecificNotes}
        generatingCollectionForId={generatingCollectionForId}
        onClose={closeCollectionMails}
        onSaveSpecificNotes={() => void saveMailSpecificNotes()}
        onGenerateSingle={(group) => void generateSingleCollectionMail(group)}
        onGenerateAll={() => void generateAllCollectionMails()}
      />

      <HuelgaEditorModal
        open={editorOpen}
        editingId={editingId}
        draft={draft}
        sindicatos={sindicatos}
        saving={saving}
        onClose={() => setEditorOpen(false)}
        onDraftChange={setDraft}
        onToggleSindicato={toggleSindicato}
        onAddTramo={addTramo}
        onUpdateTramo={updateTramo}
        onRemoveTramo={removeTramo}
        onSave={() => void save()}
      />

      {dialogNode}
    </div>
  );
}
