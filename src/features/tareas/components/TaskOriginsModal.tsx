import { useEffect, useMemo, useState } from 'react';
import type { TaskOriginConfig } from '../../configuracion/domain/taskOrigins';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { ActionButton } from '../../../components/ui/ActionButton';
import { DeleteConfirmDialog } from '../../../components/ui/DeleteConfirmDialog';
import { Input, Select } from '../../../components/ui/Field';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalBody, ModalHeader, ModalShell, ModalTitle } from '../../../components/ui/ModalShell';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';

export function TaskOriginsModal({ onClose }: { onClose: () => void }) {
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const addTaskOrigin = useConfiguracionStore((state) => state.addTaskOrigin);
  const updateTaskOrigin = useConfiguracionStore((state) => state.updateTaskOrigin);
  const toggleTaskOrigin = useConfiguracionStore((state) => state.toggleTaskOrigin);
  const deleteTaskOrigin = useConfiguracionStore((state) => state.deleteTaskOrigin);
  const [newOriginName, setNewOriginName] = useState('');
  const [newOriginType, setNewOriginType] = useState<TaskOriginConfig['tipo']>('sindicato');

  const sortedOrigins = useMemo(
    () =>
      taskOrigins
        .filter((origin) => !origin.deletedAt)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [taskOrigins],
  );

  const submitNewOrigin = () => {
    if (!newOriginName.trim()) return;
    addTaskOrigin(newOriginName, newOriginType);
    setNewOriginName('');
    setNewOriginType('sindicato');
  };

  return (
    <ModalShell labelledBy="task-origins-title" maxWidthClassName="max-w-3xl" onClose={onClose}>
      <ModalHeader>
        <ModalTitle
          id="task-origins-title"
          subtitle="Alta, edición y activación de sindicatos, áreas internas u otros orígenes."
        >
          Orígenes de tareas
        </ModalTitle>
        <div className="flex items-center gap-2">
          <InlineSaveFeedback />
          <ModalCloseButton label="Cerrar mantenimiento de orígenes" onClick={onClose} />
        </div>
      </ModalHeader>
      <ModalBody className="space-y-3">
        <div className="grid gap-2 rounded-xl bg-metro-panel/45 p-3 md:grid-cols-[minmax(220px,1fr)_160px_110px]">
          <Input
            onChange={(event) => setNewOriginName(event.target.value)}
            placeholder="Nuevo origen"
            value={newOriginName}
          />
          <OriginTypeSelect onChange={setNewOriginType} value={newOriginType} />
          <ActionButton disabled={!newOriginName.trim()} iconOnly={false} onClick={submitNewOrigin} variant="add">
            Añadir
          </ActionButton>
        </div>
        <div className="min-h-0 overflow-auto rounded-xl border border-metro-border">
          <CompactTable className="table-fixed">
            <CompactTableHead>
              <tr>
                <th className="w-[38%] px-3 py-2">Nombre</th>
                <th className="w-[24%] px-3 py-2">Tipo</th>
                <th className="w-[16%] px-3 py-2">Estado</th>
                <th className="w-[26%] px-3 py-2 text-right">Acciones</th>
              </tr>
            </CompactTableHead>
            <CompactTableBody>
              {sortedOrigins.map((origin) => (
                <TaskOriginRow
                  key={origin.id}
                  origin={origin}
                  onDelete={deleteTaskOrigin}
                  onToggle={toggleTaskOrigin}
                  onUpdate={updateTaskOrigin}
                />
              ))}
            </CompactTableBody>
          </CompactTable>
        </div>
      </ModalBody>
    </ModalShell>
  );
}

function TaskOriginRow({
  origin,
  onDelete,
  onToggle,
  onUpdate,
}: {
  origin: TaskOriginConfig;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, nombre: string, tipo: TaskOriginConfig['tipo']) => void;
}) {
  const [name, setName] = useState(origin.nombre);
  const [type, setType] = useState<TaskOriginConfig['tipo']>(origin.tipo);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const hasChanges = name.trim() !== origin.nombre || type !== origin.tipo;

  useEffect(() => {
    setName(origin.nombre);
    setType(origin.tipo);
  }, [origin.nombre, origin.tipo]);

  return (
    <>
      {isDeleteConfirmVisible && (
        <tr>
          <td className="px-3 py-2" colSpan={4}>
            <DeleteConfirmDialog
              label={`el origen «${origin.nombre}»`}
              onCancel={() => setIsDeleteConfirmVisible(false)}
              onConfirm={() => {
                onDelete(origin.id);
                setIsDeleteConfirmVisible(false);
              }}
            />
          </td>
        </tr>
      )}
      <tr className="align-top">
        <td className="px-3 py-2">
          <Input onChange={(event) => setName(event.target.value)} value={name} />
        </td>
        <td className="px-3 py-2">
          <OriginTypeSelect onChange={setType} value={type} />
        </td>
        <td className="px-3 py-2">
          <StatusBadge tone={origin.active ? 'success' : 'muted'}>
            {origin.active ? 'Activo' : 'Inactivo'}
          </StatusBadge>
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton
              disabled={!hasChanges || !name.trim()}
              iconOnly={false}
              onClick={() => onUpdate(origin.id, name, type)}
              size="sm"
              variant="save"
            >
              Guardar
            </ActionButton>
            <ActionButton iconOnly={false} onClick={() => onToggle(origin.id)} size="sm" variant="secondary">
              {origin.active ? 'Desactivar' : 'Activar'}
            </ActionButton>
            <ActionButton iconOnly={false} onClick={() => setIsDeleteConfirmVisible(true)} size="sm" variant="delete">
              Eliminar
            </ActionButton>
          </div>
        </td>
      </tr>
    </>
  );
}

function OriginTypeSelect({
  value,
  onChange,
}: {
  value: TaskOriginConfig['tipo'];
  onChange: (value: TaskOriginConfig['tipo']) => void;
}) {
  return (
    <Select onChange={(event) => onChange(event.target.value as TaskOriginConfig['tipo'])} value={value}>
      <option value="sindicato">Sindicato</option>
      <option value="empresa">Empresa</option>
      <option value="otro">Otro</option>
    </Select>
  );
}
