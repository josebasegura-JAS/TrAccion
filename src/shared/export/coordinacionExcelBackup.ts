import { useConfiguracionStore } from '../../features/configuracion/store/useConfiguracionStore';
import type { CoordinationMeeting } from '../../features/coordinacion/domain/coordinacion';
import { formatCoordinationDate } from '../../features/coordinacion/domain/coordinacion';
import { coordinationPointStatusLabel } from '../../features/coordinacion/store/useCoordinacionStore';

function toArrayBuffer(buffer: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer;
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function resolveDirectory(template: string, year: number): string {
  return template.split('{year}').join(String(year)).trim();
}

export async function syncCoordinacionExcelBackup(meetings: CoordinationMeeting[]): Promise<string | null> {
  const template = useConfiguracionStore.getState().rutaExportacionCoordinacion;
  if (!template.trim()) return 'Datos guardados en TrAccion. Configura en Ajustes la ruta del backup Excel de Coordinación.';
  if (!window.traccion?.saveOperationalExcelBackup) return 'Datos guardados en TrAccion, pero el backup Excel solo está disponible en la aplicación de escritorio.';

  try {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TrAccion';
    workbook.subject = 'Histórico de Coordinación RRLL con Dirección';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sorted = [...meetings].filter((meeting) => meeting.area === 'direccion').sort((a, b) => a.date.localeCompare(b.date));
    const reuniones = workbook.addWorksheet('Reuniones', { views: [{ state: 'frozen', ySplit: 1 }] });
    reuniones.columns = [
      { header: 'ID', key: 'id', width: 26 },
      { header: 'Fecha', key: 'fecha', width: 14 },
      { header: 'Estado', key: 'estado', width: 14 },
      { header: 'Nº puntos', key: 'puntos', width: 12 },
      { header: 'Creada', key: 'creada', width: 22 },
      { header: 'Cerrada', key: 'cerrada', width: 22 },
    ];
    reuniones.getRow(1).font = { bold: true };
    for (const meeting of sorted) reuniones.addRow({ id: meeting.id, fecha: formatCoordinationDate(meeting.date), estado: meeting.status === 'closed' ? 'Cerrada' : 'Abierta', puntos: meeting.points.length, creada: new Date(meeting.createdAt).toLocaleString('es-ES'), cerrada: meeting.closedAt ? new Date(meeting.closedAt).toLocaleString('es-ES') : '' });

    const puntos = workbook.addWorksheet('Puntos', { views: [{ state: 'frozen', ySplit: 1 }] });
    puntos.columns = [
      { header: 'Fecha reunión', key: 'fecha', width: 16 },
      { header: 'Origen', key: 'origen', width: 14 },
      { header: 'ID tarea', key: 'taskId', width: 26 },
      { header: 'Punto', key: 'titulo', width: 40 },
      { header: 'Detalle', key: 'detalle', width: 55 },
      { header: 'Resultado / indicaciones', key: 'resultado', width: 60 },
      { header: 'Estado', key: 'estado', width: 18 },
    ];
    puntos.getRow(1).font = { bold: true };
    for (const meeting of sorted) for (const point of meeting.points) puntos.addRow({ fecha: formatCoordinationDate(meeting.date), origen: point.origin === 'task' ? 'Tarea' : 'Manual', taskId: point.taskId ?? '', titulo: point.title, detalle: point.detail, resultado: point.result, estado: coordinationPointStatusLabel(point.status) });

    const raw = await workbook.xlsx.writeBuffer();
    const currentYear = new Date().getFullYear();
    const directory = resolveDirectory(template, currentYear);
    const result = await window.traccion.saveOperationalExcelBackup({ directory, fileName: 'Coordinacion_Direccion.xlsx', cleanupPrefix: 'Coordinacion_Direccion', buffer: toArrayBuffer(raw as ArrayBuffer | Uint8Array) });
    return result.ok ? null : result.message;
  } catch (error) {
    return `Datos guardados en TrAccion, pero no se ha podido actualizar el Excel de Coordinación: ${error instanceof Error ? error.message : String(error)}`;
  }
}
