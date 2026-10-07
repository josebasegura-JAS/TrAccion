import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';
import { useAppDialog } from '../../../hooks/useAppDialog';
import { ActionButton } from '../../../components/ui/ActionButton';
import { CLOSED_TASK_PHASE, DEFAULT_TASK_PHASE, type Task, type TaskDraft } from '../domain/task';
import { useTaskStore } from '../store/useTaskStore';
import {
  HISTORIC_PAGE_SIZE_OPTIONS,
  sortHistoricTasks,
  type HistoricSortKey,
  type HistoricSortState,
  type HistoricYearGroup,
} from './tareasHistoricUtils';

const historicColumns: Array<{ key: HistoricSortKey; label: string; className: string }> = [
  { key: 'titulo', label: 'Título', className: 'w-[320px]' },
  { key: 'closedAt', label: 'Fecha cierre', className: 'w-[150px]' },
  { key: 'responsable', label: 'Responsable', className: 'w-[190px]' },
  { key: 'prioridad', label: 'Prioridad', className: 'w-[120px]' },
];

function formatDateTime(value: string | null): string {
  if (!value) return '—';

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}


export function HistoricYearSection({
  group,
  isOpen,
  onOpenChange,
  onOpenTask,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  page,
  pageSize,
  sortState,
}: {
  group: HistoricYearGroup;
  isOpen: boolean;
  onOpenChange: (year: string) => void;
  onOpenTask: (task: Task) => void;
  onPageChange: (year: string, page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (key: HistoricSortKey) => void;
  page: number;
  pageSize: number;
  sortState: HistoricSortState;
}) {
  const sortedTasks = useMemo(() => (isOpen ? sortHistoricTasks(group.tasks, sortState) : []), [
    group.tasks,
    isOpen,
    sortState,
  ]);
  const updateWithConcurrencyCheck = useTaskStore((state) => state.updateWithConcurrencyCheck);
  const { alert, confirm, dialogNode } = useAppDialog();

  const handleReopenTask = async (task: Task) => {
    const confirmed = await confirm(`La tarea “${task.titulo}” volverá a la lista de tareas activas.`, {
      title: 'Reabrir tarea',
      confirmLabel: 'Reabrir tarea',
      cancelLabel: 'Cancelar',
    });
    if (!confirmed) return;

    const draft: TaskDraft = {
      titulo: task.titulo,
      descripcion: task.descripcion,
      tipo: task.tipo,
      fase: task.fase.trim().toLowerCase() === CLOSED_TASK_PHASE ? DEFAULT_TASK_PHASE : task.fase,
      estado: 'pendiente',
      prioridad: task.prioridad,
      fechaLimite: task.fechaLimite,
      responsable: task.responsable,
      origen: task.origen,
      sindicato: task.sindicato,
      observaciones: task.observaciones,
      mail: task.mail,
      documentLinks: task.documentLinks,
    };
    const result = await updateWithConcurrencyCheck(
      task.id,
      draft,
      'Tarea reabierta desde el histórico.',
      task.updatedAt,
    );
    if (!result.ok) await alert(result.message || 'No se ha podido reabrir la tarea.');
  };

  const totalPages = Math.max(1, Math.ceil(group.tasks.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const firstRow = (safePage - 1) * pageSize;
  const visibleTasks = sortedTasks.slice(firstRow, firstRow + pageSize);
  const firstVisible = group.tasks.length === 0 ? 0 : firstRow + 1;
  const lastVisible = Math.min(firstRow + pageSize, group.tasks.length);

  return (
    <>
      {dialogNode}
      <div className="border-b border-metro-border last:border-b-0">
      <button
        className="flex w-full items-center gap-2 bg-metro-panel px-3 py-2 text-left text-sm font-bold text-metro-text hover:bg-metro-red/10"
        onClick={() => onOpenChange(group.year)}
        type="button"
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {group.year} ({group.tasks.length})
      </button>
      {isOpen && (
        <div className="border-t border-metro-border bg-metro-surface">
          <div className="flex flex-col gap-2 border-b border-metro-border px-3 py-2 text-xs text-metro-muted md:flex-row md:items-center md:justify-between">
            <span>
              Mostrando {firstVisible}-{lastVisible} de {group.tasks.length}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                Mostrar
                <select
                  className="h-8 rounded-lg border border-metro-border bg-metro-panel px-2 text-metro-text outline-none"
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                  value={pageSize}
                >
                  {HISTORIC_PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <ActionButton
                disabled={safePage <= 1}
                iconOnly={false}
                onClick={() => onPageChange(group.year, safePage - 1)}
                size="sm"
                variant="secondary"
              >
                ← Anterior
              </ActionButton>
              <span className="font-semibold text-metro-text">
                Página {safePage} de {totalPages}
              </span>
              <ActionButton
                disabled={safePage >= totalPages}
                iconOnly={false}
                onClick={() => onPageChange(group.year, safePage + 1)}
                size="sm"
                variant="secondary"
              >
                Siguiente →
              </ActionButton>
            </div>
          </div>
          <div className="max-h-[320px] overflow-auto">
            <CompactTable className="table-fixed">
              <CompactTableHead>
                <tr>
                  {historicColumns.map((column) => {
                    const isActive = sortState.key === column.key;
                    return (
                      <th className={`${column.className} px-3 py-2`} key={column.key}>
                        <button
                          className="flex w-full items-center gap-1 text-left font-semibold hover:text-metro-text"
                          onClick={() => onSortChange(column.key)}
                          type="button"
                        >
                          <span>{column.label}</span>
                          {isActive && <span>{sortState.direction === 'asc' ? '↑' : '↓'}</span>}
                        </button>
                      </th>
                    );
                  })}
                  <th className="w-[150px] px-3 py-2 text-right font-semibold">Acciones</th>
                </tr>
              </CompactTableHead>
              <CompactTableBody>
                {visibleTasks.map((task) => (
                  <tr
                    className="cursor-pointer hover:bg-metro-red/10"
                    key={task.id}
                    onClick={() => onOpenTask(task)}
                  >
                    <td className="truncate px-3 py-1.5 font-semibold text-metro-text" title={task.titulo}>
                      {task.titulo}
                    </td>
                    <td className="truncate px-3 py-1.5 text-metro-muted" title={formatDateTime(task.closedAt)}>
                      {formatDateTime(task.closedAt)}
                    </td>
                    <td className="truncate px-3 py-1.5 text-metro-muted" title={task.responsable}>
                      {task.responsable || '—'}
                    </td>
                    <td className="truncate px-3 py-1.5 text-metro-muted" title={task.prioridad}>
                      {task.prioridad}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <ActionButton
                        icon={RotateCcw}
                        iconOnly={false}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleReopenTask(task);
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        Reabrir tarea
                      </ActionButton>
                    </td>
                  </tr>
                ))}
              </CompactTableBody>
            </CompactTable>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
