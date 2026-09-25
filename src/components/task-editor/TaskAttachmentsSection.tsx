import type { Dispatch, SetStateAction } from 'react';
import { Eye, Mail, Paperclip, Search } from 'lucide-react';
import { ActionButton } from '../ui/ActionButton';
import { Input, Textarea } from '../ui/Field';
import type { TaskDraft } from '../../features/tareas/domain/task';
import { TaskEditorSection } from './TaskEditorSection';

export function TaskAttachmentsSection({
  draft, setDraft, manualDocumentPath, setManualDocumentPath, documentStatus,
  mailStatus, mailDragActive, setMailDragActive, isFormReadOnly,
  onAddDocument, onSelectDocument, onImportMailFile,
}: {
  draft: TaskDraft;
  setDraft: Dispatch<SetStateAction<TaskDraft>>;
  manualDocumentPath: string;
  setManualDocumentPath: Dispatch<SetStateAction<string>>;
  documentStatus: string;
  mailStatus: string;
  mailDragActive: boolean;
  setMailDragActive: Dispatch<SetStateAction<boolean>>;
  isFormReadOnly: boolean;
  onAddDocument: () => void;
  onSelectDocument: () => Promise<void>;
  onImportMailFile: (file?: File) => Promise<void>;
}) {
  return <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
    <TaskEditorSection icon={Paperclip} title="Documentos vinculados">
      <div className="flex gap-2">
        <Input className="min-w-0 flex-1" placeholder="Pegar ruta de red o local..." value={manualDocumentPath} onChange={(e) => setManualDocumentPath(e.target.value)} />
        <button aria-label="Buscar documento" className="rounded-lg border border-metro-border px-3 text-metro-muted hover:text-white" onClick={() => void onSelectDocument()} type="button"><Search size={16} /></button>
        <ActionButton iconOnly={false} onClick={onAddDocument} size="sm" variant="add">Añadir ruta</ActionButton>
      </div>
      {draft.documentLinks.length > 0 && <div className="mt-2 space-y-1">{draft.documentLinks.map((link) => <div className="flex items-center justify-between gap-2 rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5" key={link.id}>
        <span className="min-w-0 truncate text-xs font-semibold text-slate-300" title={link.ruta}>{link.nombre}</span>
        <div className="flex gap-1">
          <button className="p-1.5 text-metro-muted hover:text-white" onClick={() => void window.traccion?.openTaskDocument?.(link.ruta)} type="button"><Eye size={14} /></button>
          <ActionButton onClick={() => setDraft((c) => ({ ...c, documentLinks: c.documentLinks.filter((item) => item.id !== link.id) }))} size="sm" variant="delete" />
        </div>
      </div>)}</div>}
      {documentStatus && <p className="mt-2 text-[11px] font-semibold text-metro-muted">{documentStatus}</p>}
    </TaskEditorSection>

    <TaskEditorSection icon={Mail} title="Email de origen" action={<label className="cursor-pointer rounded-md border border-metro-border px-2 py-1 text-[11px] font-semibold text-slate-300 hover:border-metro-red">Seleccionar mensaje .msg<input accept=".msg" className="sr-only" type="file" onChange={(e) => void onImportMailFile(e.target.files?.[0])} /></label>}>
      <div className={`rounded-lg border border-dashed p-2 transition-colors ${mailDragActive ? 'border-sky-300 bg-sky-400/10' : 'border-slate-600/80 bg-slate-950/10'}`}
        onDragEnter={(event) => { event.preventDefault(); if (!isFormReadOnly) setMailDragActive(true); }}
        onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget.contains(event.relatedTarget as Node | null)) return; setMailDragActive(false); }}
        onDragOver={(event) => { event.preventDefault(); if (!isFormReadOnly) event.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(event) => { event.preventDefault(); setMailDragActive(false); if (isFormReadOnly) return; const file = Array.from(event.dataTransfer.files).find((candidate) => /\.msg$/i.test(candidate.name)); void onImportMailFile(file); }}>
        <p className="mb-2 text-[10px] font-semibold text-slate-400">Arrastra aquí un correo .msg de Outlook. Se guardarán remitente, fecha, asunto y contenido en texto plano.</p>
        <Textarea className="min-h-40" placeholder="Correo vinculado a la tarea..." value={draft.mail} onChange={(e) => setDraft((c) => ({ ...c, mail: e.target.value }))} />
      </div>
      {mailStatus && <p className="mt-2 text-[11px] font-semibold text-metro-muted">{mailStatus}</p>}
    </TaskEditorSection>
  </div>;
}
