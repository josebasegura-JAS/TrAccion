import { HuelgasOverview } from './HuelgasOverview';
import { HuelgaEditorModal } from './HuelgaEditorModal';
import { HuelgasZonesModals } from './HuelgasZonesModals';
import { HuelgasCollectionMailsModal } from './HuelgasCollectionMailsModal';
import { HuelgasResponseCollectionModal } from './HuelgasResponseCollectionModal';
import { useHuelgaResponseCollection } from './useHuelgaResponseCollection';
import { useHuelgasPageController } from './useHuelgasPageController';

export function HuelgasPage() {
  const {
    huelgas,
    sortedHuelgas,
    nextHuelga,
    zonas,
    generatingCollectionForId,
    openZones,
    openNew,
    openEdit,
    openCollectionMails,
    remove,
    zonesOpen,
    zoneDraft,
    savingZones,
    mailTemplateZone,
    setMailTemplateZoneId,
    closeZones,
    updateZone,
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

  const responseCollection = useHuelgaResponseCollection(huelgas, zonas);

  return (
    <div className="ui3-huelgas space-y-3">
      <HuelgasOverview
        huelgas={huelgas}
        sortedHuelgas={sortedHuelgas}
        nextHuelga={nextHuelga ?? null}
        zonas={zonas}
        generatingCollectionForId={generatingCollectionForId}
        collectionStatusFor={responseCollection.collectionStatusFor}
        onOpenZones={openZones}
        onOpenNew={openNew}
        onOpenEdit={openEdit}
        onOpenCollectionMails={(huelga) => void openCollectionMails(huelga)}
        onOpenResponseCollection={responseCollection.open}
        onRemove={(huelga) => void remove(huelga)}
      />

      <HuelgasZonesModals
        zonesOpen={zonesOpen}
        zoneDraft={zoneDraft}
        savingZones={savingZones}
        mailTemplateZone={mailTemplateZone}
        setMailTemplateZoneId={setMailTemplateZoneId}
        onCloseZones={closeZones}
        onUpdateZone={updateZone}
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

      <HuelgasResponseCollectionModal
        target={responseCollection.target}
        responses={responseCollection.responses}
        totals={responseCollection.totals}
        receivedCount={responseCollection.receivedCount}
        reviewedCount={responseCollection.reviewedCount}
        validationByZone={responseCollection.validationByZone}
        validationSummary={responseCollection.validationSummary}
        globalIssues={responseCollection.globalIssues}
        dirty={responseCollection.dirty}
        saving={responseCollection.saving}
        importingZoneId={responseCollection.importingZoneId}
        importingMessage={responseCollection.importingMessage}
        exporting={responseCollection.exporting}
        onClose={() => void responseCollection.close()}
        onImport={(zoneId, file) => void responseCollection.importResponse(zoneId, file)}
        onImportMessage={(file) => void responseCollection.importOutlookMessage(file)}
        onChange={responseCollection.updateResponse}
        onReview={(zoneId) => void responseCollection.markReviewed(zoneId)}
        onSave={() => void responseCollection.save()}
        onExport={() => void responseCollection.exportReport()}
      />

      <HuelgaEditorModal
        open={editorOpen}
        editingId={editingId}
        draft={draft}
        sindicatos={sindicatos}
        zonas={zonas}
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
      {responseCollection.dialogNode}
    </div>
  );
}
