import { Plus, Trash2 } from 'lucide-react';
import { DeleteConfirmDialog } from '../../../components/ui/DeleteConfirmDialog';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Input } from '../../../components/ui/Field';
import { ModalBody, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import type { ActaTypeDefinition } from '../domain/acta';

export function ActaTypeManagerModal({
  actaTypeUsage,
  actaTypes,
  deleteActaType,
  newActaTypeName,
  onClose,
  pendingDeleteActaTypeId,
  saveNewActaType,
  setNewActaTypeName,
  setPendingDeleteActaTypeId,
  toggleActaTypeWithFeedback,
}: {
  actaTypeUsage: Map<string, number>;
  actaTypes: ActaTypeDefinition[];
  deleteActaType: (typeId: string) => Promise<void>;
  newActaTypeName: string;
  onClose: () => void;
  pendingDeleteActaTypeId: string | null;
  saveNewActaType: () => Promise<void>;
  setNewActaTypeName: (value: string) => void;
  setPendingDeleteActaTypeId: (typeId: string | null) => void;
  toggleActaTypeWithFeedback: (typeId: string) => Promise<void>;
}) {
  const titleId = 'acta-type-manager-modal-title';

  return (
    <ModalShell labelledBy={titleId} maxWidthClassName="max-w-2xl" onClose={onClose}>
      <ModalHeader>
        <ModalTitle
          id={titleId}
          subtitle="Alta, deshabilitado y borrado seguro de tipos sin actas asociadas."
        >
          Tipos de acta
        </ModalTitle>
        <ModalCloseButton onClick={onClose} />
      </ModalHeader>
      <ModalBody className="space-y-4">
          <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_120px]">
            <Input
              onChange={(event) => setNewActaTypeName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void saveNewActaType();
                }
              }}
              placeholder="Nuevo tipo de acta..."
              value={newActaTypeName}
            />
            <ActionButton icon={Plus} iconOnly={false} onClick={() => void saveNewActaType()} variant="save">
              Alta
            </ActionButton>
          </div>

          <div className="space-y-2">
            {actaTypes.map((type) => {
              const usageCount = actaTypeUsage.get(type.nombre.toLowerCase()) ?? 0;
              return (
                <div
                  className="grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 xl:grid-cols-[minmax(180px,1fr)_90px_130px_44px] xl:items-center"
                  key={type.id}
                >
                  <div>
                    <p className="text-sm font-semibold text-metro-text">{type.nombre}</p>
                    <p className="text-xs text-metro-muted">
                      {type.disabled ? 'Deshabilitado' : 'Activo'}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-metro-muted">
                    {usageCount} acta{usageCount === 1 ? '' : 's'}
                  </span>
                  <button
                    className="rounded-lg border border-metro-border px-3 py-2 text-xs font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
                    onClick={() => void toggleActaTypeWithFeedback(type.id)}
                    type="button"
                  >
                    {type.disabled ? 'Habilitar' : 'Deshabilitar'}
                  </button>
                  {pendingDeleteActaTypeId === type.id ? (
                    <div className="xl:col-span-4">
                      <DeleteConfirmDialog
                        label={`el tipo de acta «${type.nombre}»`}
                        onCancel={() => setPendingDeleteActaTypeId(null)}
                        onConfirm={() => {
                          void deleteActaType(type.id);
                        }}
                      />
                    </div>
                  ) : (
                    <button
                      className="inline-flex items-center justify-center rounded-lg border border-red-500/40 p-2 text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={usageCount > 0}
                      onClick={() => setPendingDeleteActaTypeId(type.id)}
                      title={
                        usageCount > 0
                          ? 'No se puede eliminar: tiene actas asociadas'
                          : 'Eliminar tipo de acta'
                      }
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              );
            })}
            {actaTypes.length === 0 && (
              <p className="rounded-lg border border-dashed border-metro-border px-3 py-4 text-sm text-metro-muted">
                No hay tipos de acta configurados.
              </p>
            )}
          </div>
      </ModalBody>
    </ModalShell>
  );
}
