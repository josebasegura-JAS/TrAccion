import { useConfiguracionStore } from '../../features/configuracion/store/useConfiguracionStore';
import type { LicenciaSinSueldoRecord } from '../../features/licencias-sin-sueldo/domain/licenciaSinSueldo';
import { getEffectiveLicenciaEstado } from '../../features/licencias-sin-sueldo/domain/licenciaSinSueldo';
import type { Vinculograma } from '../../features/vinculograma/domain/vinculograma';
import { getVinculogramaStatus } from '../../features/vinculograma/domain/vinculograma';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function workbookBufferToArrayBuffer(buffer: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer;
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function fileDate(date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getFullYear()}`;
}

function todayIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('es-ES');
}

function humanizeLicenciaEstado(value: string): string {
  const labels: Record<string, string> = {
    pendiente_aprobacion: 'Pendiente de aprobación',
    pendiente_firma: 'Pendiente de firma',
    vigente: 'Vigente',
    denegada: 'Denegada',
    historico: 'Histórico',
  };
  return labels[value] ?? value;
}

async function saveWorkbook(
  directory: string,
  fileName: string,
  cleanupPrefix: string,
  buffer: ArrayBuffer,
): Promise<string | null> {
  if (!directory.trim() || !window.traccion?.saveOperationalExcelBackup) return null;
  const result = await window.traccion.saveOperationalExcelBackup({
    directory: directory.trim(),
    fileName,
    cleanupPrefix,
    buffer,
  });
  return result.ok ? null : result.message;
}

export function appendBackupMessage(baseMessage: string, backupMessage: string | null): string {
  return backupMessage ? `${baseMessage} ${backupMessage}` : baseMessage;
}

export async function syncLicenciasExcelBackup(records: LicenciaSinSueldoRecord[]): Promise<string | null> {
  const directory = useConfiguracionStore.getState().rutaExportacionLicencias;
  if (!directory.trim() || !window.traccion?.saveOperationalExcelBackup) return null;

  try {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TrAccion';
    workbook.subject = 'Excel espejo automático de Licencias sin sueldo y Excedencias';
    workbook.created = new Date();
    workbook.modified = new Date();

    const visible = records.filter((record) => !record.deletedAt);
    const data = workbook.addWorksheet('Datos', { views: [{ state: 'frozen', ySplit: 1 }] });
    data.columns = [
      { header: 'Nº empleado', key: 'numeroEmpleado', width: 15 },
      { header: 'Nombre y apellidos', key: 'nombreCompleto', width: 34 },
      { header: 'Tipo', key: 'tipo', width: 28 },
      { header: 'Fecha solicitud', key: 'fechaSolicitud', width: 16 },
      { header: 'Fecha inicio', key: 'fechaInicio', width: 14 },
      { header: 'Fecha fin', key: 'fechaFin', width: 14 },
      { header: 'Prórroga inicio', key: 'prorrogaInicio', width: 16 },
      { header: 'Prórroga fin', key: 'prorrogaFin', width: 16 },
      { header: 'Fecha fin efectiva', key: 'fechaFinEfectiva', width: 18 },
      { header: 'Estado', key: 'estado', width: 24 },
      { header: 'Observaciones', key: 'observaciones', width: 42 },
      { header: 'Actualizaciones', key: 'actualizaciones', width: 55 },
      { header: 'Última actualización', key: 'updatedAt', width: 22 },
    ];
    data.getRow(1).font = { bold: true };
    data.autoFilter = { from: 'A1', to: 'M1' };
    const today = todayIso();
    for (const record of visible) {
      data.addRow({
        numeroEmpleado: record.numeroEmpleado,
        nombreCompleto: record.nombreCompleto,
        tipo: record.tipo,
        fechaSolicitud: record.fechaSolicitud,
        fechaInicio: record.fechaInicio,
        fechaFin: record.fechaFin,
        prorrogaInicio: record.prorroga?.fechaInicio ?? '',
        prorrogaFin: record.prorroga?.fechaFin ?? '',
        fechaFinEfectiva: record.prorroga?.fechaFin || record.fechaFin,
        estado: humanizeLicenciaEstado(getEffectiveLicenciaEstado(record, today)),
        observaciones: record.observaciones,
        actualizaciones: record.actualizaciones.map((item) => `${item.fecha}: ${item.texto}`).join(' | '),
        updatedAt: formatDateTime(record.updatedAt),
      });
    }

    const summary = workbook.addWorksheet('Resumen');
    summary.addRow(['Licencias sin sueldo y Excedencias']);
    summary.addRow(['Última actualización', new Date().toLocaleString('es-ES')]);
    summary.addRow(['Registros', visible.length]);
    summary.addRow([]);
    summary.addRow(['Por tipo', 'Cantidad']);
    const byType = new Map<string, number>();
    const byState = new Map<string, number>();
    for (const record of visible) {
      byType.set(record.tipo, (byType.get(record.tipo) ?? 0) + 1);
      const state = humanizeLicenciaEstado(getEffectiveLicenciaEstado(record, today));
      byState.set(state, (byState.get(state) ?? 0) + 1);
    }
    for (const [key, count] of [...byType.entries()].sort()) summary.addRow([key, count]);
    summary.addRow([]);
    summary.addRow(['Por estado', 'Cantidad']);
    for (const [key, count] of [...byState.entries()].sort()) summary.addRow([key, count]);
    summary.getColumn(1).width = 34;
    summary.getColumn(2).width = 18;
    summary.getRow(1).font = { bold: true };

    const raw = await workbook.xlsx.writeBuffer();
    const buffer = workbookBufferToArrayBuffer(raw as ArrayBuffer | Uint8Array);
    return await saveWorkbook(directory, `Licencias_y_Excedencias_${fileDate()}.xlsx`, 'Licencias_y_Excedencias_', buffer);
  } catch (error) {
    return `Datos guardados en TrAccion, pero no se ha podido actualizar el Excel automático de Licencias: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function syncVinculogramaExcelBackup(records: Vinculograma[]): Promise<string | null> {
  const directory = useConfiguracionStore.getState().rutaExportacionVinculograma;
  if (!directory.trim() || !window.traccion?.saveOperationalExcelBackup) return null;

  try {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TrAccion';
    workbook.subject = 'Excel espejo automático de Vinculograma';
    workbook.created = new Date();
    workbook.modified = new Date();

    const visible = records.filter((record) => !record.deletedAt);
    const data = workbook.addWorksheet('Datos', { views: [{ state: 'frozen', ySplit: 1 }] });
    data.columns = [
      { header: 'Nº empleado', key: 'employeeNumber', width: 15 },
      { header: 'Nombre y apellidos', key: 'nombreCompleto', width: 34 },
      { header: 'Persona vinculada', key: 'linkedPerson', width: 34 },
      { header: 'Fecha solicitud', key: 'requestDate', width: 16 },
      { header: 'Fecha vencimiento', key: 'expiryDate', width: 18 },
      { header: 'Estado', key: 'status', width: 14 },
      { header: 'Fecha revocación', key: 'revokedAt', width: 17 },
      { header: 'Motivo revocación', key: 'revocationReason', width: 42 },
      { header: 'Última actualización', key: 'updatedAt', width: 22 },
    ];
    data.getRow(1).font = { bold: true };
    data.autoFilter = { from: 'A1', to: 'I1' };
    const today = todayIso();
    for (const record of visible) {
      data.addRow({
        employeeNumber: record.employeeNumber,
        nombreCompleto: record.nombreCompleto,
        linkedPerson: record.linkedPerson,
        requestDate: record.requestDate,
        expiryDate: record.expiryDate,
        status: getVinculogramaStatus(record.expiryDate, today, record.revokedAt),
        revokedAt: record.revokedAt,
        revocationReason: record.revocationReason,
        updatedAt: formatDateTime(record.updatedAt),
      });
    }

    const summary = workbook.addWorksheet('Resumen');
    summary.addRow(['Vinculograma']);
    summary.addRow(['Última actualización', new Date().toLocaleString('es-ES')]);
    summary.addRow(['Registros', visible.length]);
    summary.addRow([]);
    summary.addRow(['Estado', 'Cantidad']);
    const counts = new Map<string, number>();
    for (const record of visible) {
      const status = getVinculogramaStatus(record.expiryDate, today, record.revokedAt);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    for (const status of ['Vigente', 'Vencido', 'Revocado']) summary.addRow([status, counts.get(status) ?? 0]);
    summary.getColumn(1).width = 30;
    summary.getColumn(2).width = 18;
    summary.getRow(1).font = { bold: true };

    const raw = await workbook.xlsx.writeBuffer();
    const buffer = workbookBufferToArrayBuffer(raw as ArrayBuffer | Uint8Array);
    return await saveWorkbook(directory, `Vinculograma_${fileDate()}.xlsx`, 'Vinculograma_', buffer);
  } catch (error) {
    return `Datos guardados en TrAccion, pero no se ha podido actualizar el Excel automático de Vinculograma: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export const OPERATIONAL_BACKUP_MIME = MIME;
