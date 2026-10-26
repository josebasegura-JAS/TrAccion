import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import { buildTableExcelBuffer } from '../../../shared/export/tableExport';
import { saveExcelBackupWithRetry } from '../../../shared/export/saveExcelBackupWithRetry';
import { buildFilterLabel } from '../../../shared/export/filterLabel';
import { monthlyCalculationExportColumns } from '../components/ticketRestauranteExport';
import type { TicketPersonCalculation, TicketRestaurantAbsence, TicketRestaurantConfig } from '../domain/ticketRestaurante';

/** Usa exactamente el mismo generador y preset visual que la exportación manual. */
export async function syncTicketRestauranteMonthlyBackup({
  config, year, month, rows, absences,
}: {
  config: TicketRestaurantConfig;
  year: number;
  month: number;
  rows: readonly TicketPersonCalculation[];
  absences: readonly TicketRestaurantAbsence[];
}): Promise<string | null> {
  const directory = useConfiguracionStore.getState().rutaExportacionTicketRestaurante?.trim();
  if (!directory) return null;
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
  const capitalizedMonth = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);
  const fileName = `Computo_${capitalizedMonth}_${year}.xlsx`;
  try {
    const orderedRows = [...rows].sort((a, b) =>
      a.calendario.localeCompare(b.calendario, 'es') ||
      a.nombreApellidos.localeCompare(b.nombreApellidos, 'es'));
    const buffer = await buildTableExcelBuffer({
      title: 'Cómputo mensual Ticket Restaurante',
      filename: `Computo_${capitalizedMonth}_${year}`,
      columns: monthlyCalculationExportColumns(config, year, month, absences),
      rows: orderedRows,
      rowGroupValue: (row) => row.calendario,
      filterLabel: buildFilterLabel([['Mes', month], ['Año', year]]),
      formatPreset: 'ticket-restaurante-monthly',
    });
    return saveExcelBackupWithRetry({ directory, fileName, cleanupPrefix: '', buffer });
  } catch (error) {
    return `No se ha podido generar el backup de Ticket Restaurante: ${error instanceof Error ? error.message : String(error)}`;
  }
}
