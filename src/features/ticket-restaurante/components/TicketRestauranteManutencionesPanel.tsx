import { Trash2 } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';
import type { TicketPerson } from '../domain/ticketRestaurante';
import type { TicketManutencion, TicketManutencionPreviewRow } from '../domain/importManutenciones';
import { MonthNavigator } from './TicketRestauranteCalendarPanels';
import { formatManutencionDate, formatManutencionMonth, normalizeTicketEmployeeSearch } from './ticketRestaurantePageHelpers';

export function ManutencionesPanel({
  importMessage,
  manualEmployee,
  manualDate,
  manutenciones,
  month,
  onAddManual,
  onExportModel,
  onImport,
  onMonthChange,
  onNextMonth,
  onPreviousMonth,
  onManualDateChange,
  onManualEmployeeChange,
  onPreviewChange,
  onRemove,
  onSavePreview,
  onYearChange,
  previewRows,
  ticketPeople,
  year,
}: {
  importMessage: string;
  manualEmployee: string;
  manualDate: string;
  manutenciones: TicketManutencion[];
  month: number;
  onAddManual: () => void;
  onExportModel: () => void;
  onImport: () => void;
  onMonthChange: (value: string) => void;
  onNextMonth: () => void;
  onPreviousMonth: () => void;
  onManualDateChange: (value: string) => void;
  onManualEmployeeChange: (value: string) => void;
  onPreviewChange: (rows: TicketManutencionPreviewRow[]) => void;
  onRemove: (id: string) => void;
  onSavePreview: () => void;
  onYearChange: (value: string) => void;
  previewRows: TicketManutencionPreviewRow[];
  ticketPeople: TicketPerson[];
  year: number;
}) {
  const manualPerson = ticketPeople.find(
    (person) =>
      normalizeTicketEmployeeSearch(person.empleado) ===
      normalizeTicketEmployeeSearch(manualEmployee),
  );
  const rowsToImport = previewRows.filter((row) => row.importar).length;

  const updatePreviewRow = (
    rowId: string,
    patch: Partial<Pick<TicketManutencionPreviewRow, 'importar' | 'afectaTicket'>>,
  ) => {
    onPreviewChange(previewRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  };

  return (
    <div className="rounded-xl border border-metro-border bg-metro-panel p-2.5">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-metro-text">Manutenciones</h3>
          <p className="text-xs text-metro-muted">
            Importa notas de gasto y deja preparada la revisión. Las notas marcadas como afectantes
            descontarán tickets en el mes imputado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red"
            onClick={onExportModel}
            type="button"
          >
            Modelo
          </button>
          <ActionButton iconOnly={false} onClick={onImport} size="sm" variant="import">
            Importar desde Excel
          </ActionButton>
        </div>
      </div>

      {importMessage ? (
        <p className="mb-2 text-xs font-semibold text-metro-muted">{importMessage}</p>
      ) : null}

      <div className="mb-3 rounded-lg border border-metro-border bg-metro-surface p-2">
        <p className="mb-2 text-xs font-bold text-metro-muted">
          Alta manual
        </p>
        <div className="grid gap-2 lg:grid-cols-[140px_190px_1fr_auto] lg:items-center">
          <input
            className="h-8 rounded-lg border border-metro-border bg-metro-surface px-2 text-sm text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => onManualEmployeeChange(event.target.value)}
            placeholder="Nº empleado"
            value={manualEmployee}
          />
          <input
            className="h-8 rounded-lg border border-metro-border bg-metro-surface px-2 text-sm text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => onManualDateChange(event.target.value)}
            type="date"
            value={manualDate}
          />
          <div className="text-xs font-semibold text-metro-muted">
            {manualPerson
              ? manualPerson.nombreApellidos
              : 'Introduce una persona con derecho a ticket'}
          </div>
          <ActionButton
            disabled={!manualPerson || !manualDate}
            iconOnly={false}
            onClick={onAddManual}
            size="sm"
            variant="add"
          >
            Añadir
          </ActionButton>
        </div>
      </div>

      {previewRows.length > 0 ? (
        <div className="mb-3 rounded-lg border border-metro-border bg-metro-surface p-2">
          <div className="mb-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-bold text-metro-muted">Preview</p>
              <p className="text-xs text-metro-muted">
                {rowsToImport} registros marcados para importar.
              </p>
            </div>
            <button
              className="rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
              disabled={rowsToImport === 0 || previewRows.some((row) => row.errors.length > 0)}
              onClick={onSavePreview}
              type="button"
            >
              Guardar importación
            </button>
          </div>
          <div className="overflow-x-auto">
            <CompactTable>
              <CompactTableHead>
                <tr>
                  <th className="px-2 py-1">Importar</th>
                  <th className="px-2 py-1">Afecta a ticket</th>
                  <th className="px-2 py-1">Nº empleado</th>
                  <th className="px-2 py-1">Nombre</th>
                  <th className="px-2 py-1">Fecha gasto</th>
                  <th className="px-2 py-1">Origen</th>
                  <th className="px-2 py-1">Errores</th>
                </tr>
              </CompactTableHead>
              <CompactTableBody>
                {previewRows.map((row) => (
                  <tr className="border-t border-metro-border" key={row.id}>
                    <td className="px-2 py-1">
                      <input
                        checked={row.importar}
                        className="h-4 w-4 accent-metro-red"
                        onChange={(event) =>
                          updatePreviewRow(row.id, { importar: event.target.checked })
                        }
                        type="checkbox"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        checked={row.afectaTicket}
                        className="h-4 w-4 accent-metro-red"
                        onChange={(event) =>
                          updatePreviewRow(row.id, { afectaTicket: event.target.checked })
                        }
                        type="checkbox"
                      />
                    </td>
                    <td className="px-2 py-1 font-semibold text-metro-text">{row.empleado}</td>
                    <td className="px-2 py-1 text-metro-text">{row.nombreApellidos}</td>
                    <td className="px-2 py-1 text-metro-text">
                      {formatManutencionDate(row.fechaGasto)}
                    </td>
                    <td className="px-2 py-1 text-metro-muted">{row.origen}</td>
                    <td className="px-2 py-1 text-metro-red">{row.errors.join(' ')}</td>
                  </tr>
                ))}
              </CompactTableBody>
            </CompactTable>
          </div>
        </div>
      ) : null}

      <div className="mb-2 flex flex-col gap-2 rounded-lg border border-metro-border bg-metro-surface p-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-semibold text-metro-muted">
          Manutenciones del mes seleccionado: <span className="text-metro-red">{manutenciones.length}</span>
        </div>
        <MonthNavigator
          ariaLabel="Selector mes manutenciones"
          month={month}
          onMonthChange={onMonthChange}
          onNextMonth={onNextMonth}
          onPreviousMonth={onPreviousMonth}
          onYearChange={onYearChange}
          year={year}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-metro-border bg-metro-surface">
        <CompactTable>
          <CompactTableHead>
            <tr>
              <th className="px-2 py-2">Nº empleado</th>
              <th className="px-2 py-2">Nombre</th>
              <th className="px-2 py-2">Fecha gasto</th>
              <th className="px-2 py-2">Mes imputado</th>
              <th className="px-2 py-2">Origen</th>
              <th className="px-2 py-2">Afecta a ticket</th>
              <th className="px-2 py-2">Acciones</th>
            </tr>
          </CompactTableHead>
          <CompactTableBody>
            {manutenciones.length === 0 ? (
              <tr>
                <td className="px-2 py-6 text-center text-sm text-metro-muted" colSpan={7}>
                  No hay manutenciones cargadas.
                </td>
              </tr>
            ) : (
              manutenciones.map((row) => (
                <tr className="border-t border-metro-border" key={row.id}>
                  <td className="px-2 py-1 font-semibold text-metro-text">{row.empleado}</td>
                  <td className="px-2 py-1 text-metro-text">{row.nombreApellidos}</td>
                  <td className="px-2 py-1 text-metro-text">
                    {formatManutencionDate(row.fechaGasto)}
                  </td>
                  <td className="px-2 py-1 text-metro-muted">
                    {formatManutencionMonth(row.imputacionYear, row.imputacionMonth)}
                  </td>
                  <td className="px-2 py-1 text-metro-muted">{row.origen}</td>
                  <td className="px-2 py-1 text-metro-text">{row.afectaTicket ? 'Sí' : 'No'}</td>
                  <td className="px-2 py-1">
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-metro-border px-2 py-1 text-xs font-semibold text-metro-text hover:border-metro-red"
                      onClick={() => onRemove(row.id)}
                      type="button"
                    >
                      <Trash2 className="h-3 w-3" />
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </CompactTableBody>
        </CompactTable>
      </div>
    </div>
  );
}

