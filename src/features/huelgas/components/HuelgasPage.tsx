import { useState } from 'react';
import { HuelgasOverview } from './HuelgasOverview';
import { HuelgaWorkspace, type HuelgaWorkspaceTab } from './HuelgaWorkspace';
import { HuelgaEditorModal } from './HuelgaEditorModal';
import { HuelgasZonesModals } from './HuelgasZonesModals';
import { HuelgasCollectionMailsModal } from './HuelgasCollectionMailsModal';
import { HuelgasResponseCollectionModal } from './HuelgasResponseCollectionModal';
import { HuelgasResultsModal } from './HuelgasResultsModal';
import { HuelgaImportHistoryPanel } from './HuelgaImportHistoryPanel';
import { deriveHuelgaOperationalStatus } from './huelgasOperationalStatus';
import { isHuelgaResultsReady, loadHuelgaResultsCollection } from './huelgasResultsAccess';
import type { Huelga } from './huelgasPageModel';
import { useHuelgaIncrementalResponseCollection } from './useHuelgaIncrementalResponseCollection';
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
    mailRecipientsByZone,
    updateMailRecipients,
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

  const responseCollection = useHuelgaIncrementalResponseCollection(huelgas, zonas);
  const [resultsTarget, setResultsTarget] = useState<Huelga | null>(null);
  const [workspaceHuelgaId, setWorkspaceHuelgaId] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<HuelgaWorkspaceTab>('resumen');
  const workspaceHuelga = workspaceHuelgaId ? huelgas.find((item) => item.id === workspaceHuelgaId) ?? null : null;
  const resultsCollection = resultsTarget ? loadHuelgaResultsCollection(resultsTarget.id) : null;
  const resultsReadyFor = (huelga: Huelga) => isHuelgaResultsReady(loadHuelgaResultsCollection(huelga.id), huelga, zonas);
  const operationalStatusFor = (huelga: Huelga) => {
    const selectedZoneIds = huelga.circuitosZonaIds?.length
      ? huelga.circuitosZonaIds
      : zonas.filter((zona) => zona.active && zona.correoActivo).map((zona) => zona.id);
    return deriveHuelgaOperationalStatus(
      responseCollection.collectionStatusFor(huelga),
      loadHuelgaResultsCollection(huelga.id),
      selectedZoneIds,
    );
  };
  const openWorkspace = (huelga: Huelga, tab: HuelgaWorkspaceTab = 'resumen') => {
    setWorkspaceHuelgaId(huelga.id);
    setWorkspaceTab(tab);
  };

  return (
    <div className="ui3-huelgas space-y-3">
      {workspaceHuelga ? (
        <HuelgaWorkspace
          huelga={workspaceHuelga}
          activeTab={workspaceTab}
          status={operationalStatusFor(workspaceHuelga)}
          resultsReady={resultsReadyFor(workspaceHuelga)}
          generatingMail={generatingCollectionForId === workspaceHuelga.id}
          onTabChange={setWorkspaceTab}
          onBack={() => {
            setWorkspaceHuelgaId(null);
            setWorkspaceTab('resumen');
          }}
          onEdit={() => openEdit(workspaceHuelga)}
          onOpenCollectionMails={() => void openCollectionMails(workspaceHuelga)}
          onOpenResponseCollection={() => responseCollection.open(workspaceHuelga)}
          onOpenResults={() => setResultsTarget(workspaceHuelga)}
        />
      ) : (
        <HuelgasOverview
          huelgas={huelgas}
          sortedHuelgas={sortedHuelgas}
          nextHuelga={nextHuelga ?? null}
          zonas={zonas}
          generatingCollectionForId={generatingCollectionForId}
          collectionStatusFor={responseCollection.collectionStatusFor}
          operationalStatusFor={operationalStatusFor}
          resultsReadyFor={resultsReadyFor}
          onOpenZones={openZones}
          onOpenNew={openNew}
          onOpenEdit={openEdit}
          onOpenWorkspace={openWorkspace}
          onOpenCollectionMails={(huelga) => void openCollectionMails(huelga)}
          onOpenResponseCollection={responseCollection.open}
          onOpenResults={setResultsTarget}
          onRemove={(huelga) => void remove(huelga)}
        />
      )}

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
        mailRecipientsByZone={mailRecipientsByZone}
        onUpdateMailRecipients={updateMailRecipients}
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
        onRemove={(zoneId) => void responseCollection.removeImport(zoneId)}
        onSave={() => void responseCollection.save()}
        onExport={() => void responseCollection.exportReport()}
        onExportGrouped={() => void responseCollection.exportGroupedReport()}
      />

      <HuelgaImportHistoryPanel
        open={Boolean(responseCollection.target)}
        batches={responseCollection.importHistory}
      />

      <HuelgasResultsModal
        target={resultsTarget}
        collection={resultsCollection}
        onClose={() => setResultsTarget(null)}
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
