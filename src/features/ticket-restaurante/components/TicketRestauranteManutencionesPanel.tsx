import { useEffect, useMemo, useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import {
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalShell,
  ModalTitle,
} from '../../../components/ui/ModalShell';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';
import type { TicketPerson } from '../domain/ticketRestaurante';
import {
  evaluateTicketManutencionEligibility,
  validateTicketManutencionPreviewRows,
  type TicketManutencion,
  type TicketManutencionPreviewRow,
} from '../domain/importManutenciones';
import { useTicketRestauranteStore } from '../store/useTicketRestauranteStore';
import { MonthNavigator } from './TicketRestauranteCalendarPanels';
import {
  formatManutencionDate,
  formatManutencionMonth,
  normalizeTicketEmployeeSearch,
} from './ticketRestaurantePageHelpers';
import { ImportReviewSummary } from './TicketRestauranteImportReview';

export function ManutencionesPanel({
  importFileName,
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
  importFileName?: string;
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
  const calendars = useTicketRestauranteStore((state) => state.calendars);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const manualPerson = ticketPeople.find(
    (person) =>
      normalizeTicketEmployeeSearch(person.empleado) ===
      normalizeTicketEmployeeSearch(manualEmployee),
  );

  const reviewRows = useMemo(
    () =>
      validateTicketManutencionPreviewRows(
        previewRows.map((row) => {
          const eligibility = evaluateTicketManutencionEligibility(row, ticketPeople, calendars);
          return {
            ...row,
            nombreApellidos: eligibility.person?.nombreApellidos || row.nombreApellidos,
            importar: eligibility.eligible ? row.importar : false,
            afectaTicket: eligibility.eligible,
          };
        }),
      ),
    [calendars, previewRows, ticketPeople],
  );

  useEffect(() => {
    if (previewRows.length > 0 && importFileName) {
      setIsReviewOpen(true);
    }
  }, [importFileName, previewRows.length]);

  useEffect(() => {
    const changed = reviewRows.some((row, index) => {
      const source = previewRows[index];
      return (
        source &&
        (source.importar !== row.importar ||
          source.afectaTicket !== row.afectaTicket ||
          source.nombreApellidos !== row.nombreApellidos ||
          source.errors.join('|') !== row.errors.join('|'))
      );
    });
    if (changed) onPreviewChange(reviewRows);
  }, [onPreviewChange, previewRows, reviewRows]);

  const rowsToImport = reviewRows.filter((row) => row.importar && row.errors.length === 0).length;
  const ignoredRows = reviewRows.filter((row) => !row.importar).length;
  const errorRows = reviewRows.filter((row) => row.errors.length > 0).length;
  const blockingErrorRows = reviewRows.filter(
    (row) => row.importar && row.errors.length > 0,
  ).length;

  const updatePreviewRow = (
    rowId: string,
    patch: Partial<
      Pick<
        TicketManutencionPreviewRow,
        'empleado' | 'nombreApellidos' | 'fechaGasto' | 'origen' | 'importar'
      >
    >,
  ) => {
    const nextRows = previewRows.map((row) => {
      if (row.id !== rowId) return row;

      const edited = { ...row, ...patch, errors: [] };
      const eligibility = evaluateTicketManutencionEligibility(edited, ticketPeople, calendars);
      const personChanged = patch.empleado !== undefined;

      return {
        ...edited,
        nombreApellidos:
          personChanged && eligibility.person
            ? eligibility.person.nombreApellidos
            : edited.nombreApellidos,
        importar: eligibility.eligible ? (patch.importar ?? edited.importar) : false,
        afectaTicket: eligibility.eligible,
      };
    });

    onPreviewChange(validateTicketManutencionPreviewRows(nextRows));
  };

  const handleSavePreview = () => {
    const normalizedRows = reviewRows.map((row) => {
      const eligibility = evaluateTicketManutencionEligibility(row, ticketPeople, calendars);
      return {
        ...row,
        importar: eligibility.eligible && row.importar,
        afectaTicket: eligibility.eligible,
      };
    });
    onPreviewChange(normalizedRows);
    onSavePreview();
  };

  return (
    <div className="rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-card">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-base font-bold text-metro-text">Manutenciones</h3>
          <p className="text-xs text-metro-muted">
            Importa el formato corporativo. Se revisan pagador y personas incluidas en «Repartido
            entre», pero solo se guardan personas con derecho activo y en días que generan ticket.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {previewRows.length > 0 ? (
            <ActionButton
              iconOnly={false}
              onClick={() => setIsReviewOpen(true)}
              size="sm"
              variant="secondary"
            >
              Revisar importación ({rowsToImport})
            </ActionButton>
          ) : null}
          <ActionButton iconOnly={false} onClick={onExportModel} size="sm" variant="secondary">
            Modelo
          </ActionButton>
          <ActionButton iconOnly={false} onClick={onImport} size="sm" variant="import">
            Importar desde Excel
          </ActionButton>
        </div>
      </div>

      {importMessage ? (
        <p className="mb-2 text-xs font-semibold text-metro-muted">{importMessage}</p>
      ) : null}

      <div className="mb-3 rounded-xl border border-metro-border bg-metro-surface p-3">
        <p className="mb-2 text-xs font-bold text-metro-muted">Alta manual</p>
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
            {manualPerson ? manualPerson.nombreApellidos : 'Introduce una persona con derecho a ticket'}
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

      <div className="mb-2 flex flex-col gap-2 rounded-xl border border-metro-border bg-metro-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-semibold text-metro-muted">
          Manutenciones del mes seleccionado:{' '}
          <span className="text-metro-red">{manutenciones.length}</span>
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

      <div className="overflow-x-auto rounded-xl border border-metro-border bg-metro-surface">
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
                  <td className="px-2 py-1 text-metro-text">{formatManutencionDate(row.fechaGasto)}</td>
                  <td className="px-2 py-1 text-metro-muted">
                    {formatManutencionMonth(row.imputacionYear, row.imputacionMonth)}
                  </td>
                  <td className="px-2 py-1 text-metro-muted">{row.origen}</td>
                  <td className="px-2 py-1 text-metro-text">{row.afectaTicket ? 'Sí' : 'No'}</td>
                  <td className="px-2 py-1">
                    <ActionButton
                      iconOnly={false}
                      onClick={() => onRemove(row.id)}
                      size="sm"
                      variant="delete"
                    >
                      Eliminar
                    </ActionButton>
                  </td>
                </tr>
              ))
            )}
          </CompactTableBody>
        </CompactTable>
      </div>

      {isReviewOpen && reviewRows.length > 0 ? (
        <ModalShell
          labelledBy="ticket-manutencion-review-title"
          maxWidthClassName="max-w-6xl"
          onClose={() => setIsReviewOpen(false)}
        >
          <ModalHeader>
            <ModalTitle
              id="ticket-manutencion-review-title"
              subtitle="Puedes corregir nº de empleado, nombre, fecha, origen o excluir filas antes de guardar. La validez se recalcula automáticamente."
            >
              Revisar importación de manutenciones
            </ModalTitle>
          </ModalHeader>
          <ModalBody>
            <div className="space-y-3">
              <ImportReviewSummary
                detail="Solo se guardan personas activas con derecho a Ticket Restaurante y días que generan ticket según su calendario."
                errors={errorRows}
                fileName={importFileName}
                ignored={ignoredRows}
                ready={rowsToImport}
                total={reviewRows.length}
              />

              <div className="max-h-[58vh] overflow-auto rounded-xl border border-metro-border">
                <CompactTable>
                  <CompactTableHead>
                    <tr>
                      <th className="px-2 py-2">Guardar</th>
                      <th className="px-2 py-2">Nº empleado</th>
                      <th className="px-2 py-2">Nombre</th>
                      <th className="px-2 py-2">Fecha gasto</th>
                      <th className="px-2 py-2">Origen</th>
                      <th className="px-2 py-2">Resultado</th>
                    </tr>
                  </CompactTableHead>
                  <CompactTableBody>
                    {reviewRows.map((row) => {
                      const eligibility = evaluateTicketManutencionEligibility(
                        row,
                        ticketPeople,
                        calendars,
                      );
                      const isValid = eligibility.eligible && row.errors.length === 0;
                      return (
                        <tr className="border-t border-metro-border" key={row.id}>
                          <td className="px-2 py-2 align-top">
                            <input
                              checked={row.importar && isValid}
                              className="h-4 w-4 accent-metro-red"
                              disabled={!isValid}
                              onChange={(event) =>
                                updatePreviewRow(row.id, { importar: event.target.checked })
                              }
                              type="checkbox"
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <input
                              className="h-8 w-24 rounded-lg border border-metro-border bg-metro-surface px-2 text-sm text-metro-text outline-none focus:border-metro-red"
                              onChange={(event) =>
                                updatePreviewRow(row.id, { empleado: event.target.value })
                              }
                              value={row.empleado}
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <input
                              className="h-8 min-w-56 rounded-lg border border-metro-border bg-metro-surface px-2 text-sm text-metro-text outline-none focus:border-metro-red"
                              onChange={(event) =>
                                updatePreviewRow(row.id, { nombreApellidos: event.target.value })
                              }
                              value={row.nombreApellidos}
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <input
                              className="h-8 rounded-lg border border-metro-border bg-metro-surface px-2 text-sm text-metro-text outline-none focus:border-metro-red"
                              onChange={(event) =>
                                updatePreviewRow(row.id, { fechaGasto: event.target.value })
                              }
                              type="date"
                              value={row.fechaGasto}
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <select
                              className="h-8 rounded-lg border border-metro-border bg-metro-surface px-2 text-sm text-metro-text outline-none focus:border-metro-red"
                              onChange={(event) =>
                                updatePreviewRow(row.id, {
                                  origen: event.target.value as TicketManutencionPreviewRow['origen'],
                                })
                              }
                              value={row.origen}
                            >
                              <option value="Pagador">Pagador</option>
                              <option value="Repartido entre">Repartido entre</option>
                              <option value="Manual">Manual</option>
                            </select>
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div
                              className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                                isValid
                                  ? 'bg-emerald-500/10 text-emerald-700'
                                  : 'bg-amber-500/10 text-amber-700'
                              }`}
                            >
                              {row.errors.length > 0
                                ? row.errors.join(' ')
                                : eligibility.message}
                            </div>
                            {eligibility.calendar ? (
                              <div className="mt-1 text-[11px] text-metro-muted">
                                Calendario: {eligibility.calendar.nombre}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </CompactTableBody>
                </CompactTable>
              </div>

              <p className="text-xs leading-relaxed text-metro-muted">
                Una misma persona solo genera un descuento por fecha. Los registros duplicados
                persona/fecha se consolidan en el cálculo mensual.
              </p>
            </div>
          </ModalBody>
          <ModalFooter>
            <ActionButton
              iconOnly={false}
              onClick={() => setIsReviewOpen(false)}
              variant="secondary"
            >
              Seguir revisando después
            </ActionButton>
            <ActionButton
              disabled={rowsToImport === 0 || blockingErrorRows > 0}
              iconOnly={false}
              onClick={handleSavePreview}
              variant="save"
            >
              Continuar con {rowsToImport} manutención{rowsToImport === 1 ? '' : 'es'}
            </ActionButton>
          </ModalFooter>
        </ModalShell>
      ) : null}
    </div>
  );
}
