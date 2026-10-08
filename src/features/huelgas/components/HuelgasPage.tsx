import { HuelgasOverview } from './HuelgasOverview';
import { HuelgaEditorModal } from './HuelgaEditorModal';
import { HuelgasZonesModals } from './HuelgasZonesModals';
import { HuelgasCollectionMailsModal } from './HuelgasCollectionMailsModal';
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

  return (
    <div className="ui3-huelgas space-y-3">
      <HuelgasOverview
        huelgas={huelgas}
        sortedHuelgas={sortedHuelgas}
        nextHuelga={nextHuelga ?? null}
        zonas={zonas}
        generatingCollectionForId={generatingCollectionForId}
        onOpenZones={openZones}
        onOpenNew={openNew}
        onOpenEdit={openEdit}
        onOpenCollectionMails={(huelga) => void openCollectionMails(huelga)}
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
    </div>
  );
}
