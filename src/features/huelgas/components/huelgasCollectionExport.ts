import type { HuelgaPuestoAsignacion } from './huelgasAssignments';
import { asignacionKey } from './huelgasAssignments';
import type { HuelgaPersonalTurno } from './huelgasPersonalImport';

export type HuelgaCollectionGroup = {
  area: string;
  responsableNombre: string;
  responsableEmail: string;
  asignaciones: HuelgaPuestoAsignacion[];
  personal: HuelgaPersonalTurno[];
};

type HuelgaMailContext = {
  fecha: string;
  area: string;
  responsableNombre: string;
  personal: HuelgaPersonalTurno[];
  asignaciones: HuelgaPuestoAsignacion[];
};

function normalize(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function personaResidencia(persona: HuelgaPersonalTurno): string {
  return normalize(
    persona.residenciaAsignacion || persona.residenciaPlantilla || persona.residenciaEstacion || '',
  );
}

function groupKey(area: string, email: string): string {
  return `${normalize(area).toLocaleLowerCase('es-ES')}::${normalize(email).toLocaleLowerCase('es-ES')}`;
}

function safeFilePart(value: string): string {
  return normalize(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 70) || 'Area';
}

function formatDateLong(fecha: string): string {
  const [year, month, day] = fecha.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function formatDateFile(fecha: string): string {
  const [year, month, day] = fecha.split('-');
  return `${day}-${month}-${year}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function workbookBufferToArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }
  throw new Error('No se ha podido convertir el Excel generado a un adjunto válido.');
}

export function buildCollectionGroups(
  personal: HuelgaPersonalTurno[],
  asignaciones: HuelgaPuestoAsignacion[],
): HuelgaCollectionGroup[] {
  const assignmentByKey = new Map(
    asignaciones.map((item) => [asignacionKey(item.residencia, item.puesto), item]),
  );
  const groups = new Map<string, HuelgaCollectionGroup>();

  for (const persona of personal) {
    const residencia = personaResidencia(persona);
    const puesto = normalize(persona.puesto);
    const assignment = assignmentByKey.get(asignacionKey(residencia, puesto));
    if (!assignment?.area.trim() || !assignment.responsableEmail.trim()) continue;

    const key = groupKey(assignment.area, assignment.responsableEmail);
    const existing = groups.get(key) ?? {
      area: assignment.area.trim(),
      responsableNombre: assignment.responsableNombre.trim(),
      responsableEmail: assignment.responsableEmail.trim(),
      asignaciones: [],
      personal: [],
    };

    if (!existing.asignaciones.some((item) => asignacionKey(item.residencia, item.puesto) === asignacionKey(assignment.residencia, assignment.puesto))) {
      existing.asignaciones.push(assignment);
    }
    existing.personal.push(persona);
    groups.set(key, existing);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      asignaciones: [...group.asignaciones].sort((a, b) => {
        const residenceOrder = a.residencia.localeCompare(b.residencia, 'es', { sensitivity: 'base' });
        return residenceOrder || a.puesto.localeCompare(b.puesto, 'es', { sensitivity: 'base' });
      }),
      personal: [...group.personal].sort((a, b) => {
        const residenceOrder = personaResidencia(a).localeCompare(personaResidencia(b), 'es', { sensitivity: 'base' });
        const jobOrder = a.puesto.localeCompare(b.puesto, 'es', { sensitivity: 'base' });
        return residenceOrder || jobOrder || a.nombreApellidos.localeCompare(b.nombreApellidos, 'es', { sensitivity: 'base' });
      }),
    }))
    .sort((a, b) => a.area.localeCompare(b.area, 'es', { sensitivity: 'base' }));
}

export function buildHuelgaCollectionMailHtml(context: HuelgaMailContext): string {
  const fechaLarga = formatDateLong(context.fecha);
  const colectivos = context.asignaciones
    .map((assignment) => {
      const count = context.personal.filter(
        (persona) =>
          asignacionKey(personaResidencia(persona), persona.puesto) ===
          asignacionKey(assignment.residencia, assignment.puesto),
      ).length;
      return `<li><strong>${escapeHtml(assignment.puesto)}</strong> · ${escapeHtml(assignment.residencia)} (${count} ${count === 1 ? 'persona' : 'personas'})</li>`;
    })
    .join('');

  return `
    <p>Kaixo${context.responsableNombre ? ` ${escapeHtml(context.responsableNombre)}` : ''},</p>
    <p>Adjunto te envío el archivo a utilizar para la recogida de datos correspondiente a la <strong>huelga del ${escapeHtml(fechaLarga)}</strong>.</p>
    <p>Los datos solicitados corresponden al área <strong>${escapeHtml(context.area)}</strong> y a los siguientes colectivos:</p>
    <ul>${colectivos}</ul>
    <p>Es <strong>muy importante</strong> disponer <strong>antes de las 9:45 horas</strong> de los datos del personal que ha trabajado. Una vez cumplimentado, remite el archivo a <strong>RELACIONES_LABORALES@metrobilbao.eus</strong>.</p>
    <p>El fichero incluye las personas que tienen turno ya precargadas. Debes revisar y completar:</p>
    <ol>
      <li><strong>Personas con turno:</strong> vienen precargadas por TrAccion.</li>
      <li><strong>Servicios mínimos:</strong> marca Sí/No cuando se publique la orden correspondiente.</li>
      <li><strong>Situación:</strong> indica si la persona hace <strong>HUELGA</strong> o <strong>TRABAJA</strong>.</li>
      <li><strong>Observaciones:</strong> utiliza este campo para cualquier incidencia que debamos conocer.</li>
    </ol>
    <p><strong>IMPORTANTE:</strong></p>
    <p><strong>Personas con turno</strong>: son las personas que tienen asignado turno de trabajo, independientemente de que secunden o no la huelga.</p>
    <p><strong>Personas que trabajan</strong>: son las personas que <strong>NO</strong> secundan la huelga y no tienen asignado Servicio Mínimo.</p>
    <p>Las personas que están de servicios mínimos están incluidas en personas con turno, pero <strong>no</strong> están incluidas en personas que trabajan.</p>
    <p>Ruego nos remitas también la relación del personal —número de empleado y nombre y apellidos— que realiza <strong>HUELGA</strong>.</p>
    <p>Si tienes alguna duda, estoy a tu disposición.</p>
    <p>Un cordial saludo.</p>
  `;
}

export function buildHuelgaCollectionSubject(fecha: string, area: string): string {
  return `Seguimiento huelga ${formatDateFile(fecha)} · ${area}`;
}

export async function buildHuelgaCollectionWorkbook(
  huelgaId: string,
  fecha: string,
  group: HuelgaCollectionGroup,
): Promise<{ fileName: string; buffer: ArrayBuffer }> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TrAccion';
  workbook.created = new Date();
  workbook.modified = new Date();

  const personalSheet = workbook.addWorksheet('Personal', {
    views: [{ state: 'frozen', ySplit: 5 }],
    properties: { tabColor: { argb: 'FFD71920' } },
  });

  personalSheet.mergeCells('A1:M1');
  personalSheet.getCell('A1').value = `SEGUIMIENTO HUELGA · ${formatDateLong(fecha).toUpperCase()}`;
  personalSheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  personalSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD71920' } };
  personalSheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  personalSheet.getRow(1).height = 28;

  personalSheet.mergeCells('A2:M2');
  personalSheet.getCell('A2').value = `Área: ${group.area} · Responsable: ${group.responsableNombre || '—'} · ${group.personal.length} personas con turno`;
  personalSheet.getCell('A2').font = { bold: true, size: 11, color: { argb: 'FF1F2937' } };
  personalSheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  personalSheet.mergeCells('A3:M3');
  personalSheet.getCell('A3').value = 'Rellena únicamente las columnas Servicio mínimo, Situación y Observaciones. No modifiques los datos identificativos.';
  personalSheet.getCell('A3').font = { italic: true, color: { argb: 'FF6B7280' } };

  const headers = [
    'Nº empleado', 'Nombre y apellidos', 'Residencia', 'Puesto', 'Turno', 'Inicio', 'Salida', 'Entrada', 'Fin',
    'Servicio mínimo', 'Situación', 'Observaciones', 'TrAccion ID',
  ];
  personalSheet.getRow(5).values = headers;
  personalSheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  personalSheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
  personalSheet.getRow(5).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  personalSheet.getRow(5).height = 30;

  group.personal.forEach((persona, index) => {
    const row = 6 + index;
    personalSheet.getRow(row).values = [
      persona.empleado ?? '',
      persona.nombreApellidos,
      personaResidencia(persona),
      persona.puesto,
      persona.turno,
      persona.inicio,
      persona.salida,
      persona.entrada,
      persona.fin,
      '',
      '',
      '',
      persona.id,
    ];
    personalSheet.getRow(row).alignment = { vertical: 'middle' };
    personalSheet.getRow(row).height = 20;
    const fill = index % 2 === 0 ? 'FFFFFFFF' : 'FFF9FAFB';
    personalSheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    personalSheet.getCell(`J${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Sí,No"'],
      showErrorMessage: true,
      errorTitle: 'Valor no válido',
      error: 'Selecciona Sí o No.',
    };
    personalSheet.getCell(`K${row}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Huelga,Trabaja"'],
      showErrorMessage: true,
      errorTitle: 'Valor no válido',
      error: 'Selecciona Huelga o Trabaja.',
    };
    ['J', 'K', 'L'].forEach((column) => {
      personalSheet.getCell(`${column}${row}`).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF7ED' },
      };
    });
  });

  const endRow = Math.max(6, 5 + group.personal.length);
  personalSheet.autoFilter = { from: 'A5', to: `L${endRow}` };
  personalSheet.columns = [
    { width: 12 }, { width: 34 }, { width: 22 }, { width: 30 }, { width: 14 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 18 }, { width: 16 }, { width: 34 }, { width: 16 },
  ];
  personalSheet.getColumn(13).hidden = true;



  const summarySheet = workbook.addWorksheet('Resumen', {
    views: [{ state: 'frozen', ySplit: 7 }],
    properties: { tabColor: { argb: 'FF374151' } },
  });
  summarySheet.mergeCells('A1:G1');
  summarySheet.getCell('A1').value = `RESUMEN · HUELGA ${formatDateLong(fecha).toUpperCase()}`;
  summarySheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD71920' } };
  summarySheet.getRow(1).height = 28;
  summarySheet.mergeCells('A2:G2');
  summarySheet.getCell('A2').value = `Área: ${group.area} · Responsable: ${group.responsableNombre || '—'}`;
  summarySheet.getCell('A2').font = { bold: true, color: { argb: 'FF1F2937' } };
  summarySheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

  const total = group.personal.length;
  summarySheet.getCell('A4').value = 'Personas con turno';
  summarySheet.getCell('B4').value = total;
  summarySheet.getCell('C4').value = 'Servicios mínimos';
  summarySheet.getCell('D4').value = { formula: `COUNTIF(Personal!J6:J${endRow},"Sí")` };
  summarySheet.getCell('E4').value = 'Huelga';
  summarySheet.getCell('F4').value = { formula: `COUNTIF(Personal!K6:K${endRow},"Huelga")` };
  summarySheet.getCell('A5').value = 'Trabajan';
  summarySheet.getCell('B5').value = { formula: `COUNTIFS(Personal!K6:K${endRow},"Trabaja",Personal!J6:J${endRow},"<>Sí")` };
  summarySheet.getCell('C5').value = 'Pendientes';
  summarySheet.getCell('D5').value = { formula: `COUNTIFS(Personal!K6:K${endRow},"",Personal!J6:J${endRow},"<>Sí")` };
  summarySheet.getCell('E5').value = '% huelga';
  summarySheet.getCell('F5').value = { formula: `IF(B4=0,0,F4/B4)` };
  summarySheet.getCell('F5').numFmt = '0.0%';
  ['A4','C4','E4','A5','C5','E5'].forEach((cell) => { summarySheet.getCell(cell).font = { bold: true, color: { argb: 'FF6B7280' } }; });
  ['B4','D4','F4','B5','D5','F5'].forEach((cell) => { summarySheet.getCell(cell).font = { bold: true, size: 14, color: { argb: 'FF111827' } }; });

  const summaryHeaderRow = 7;
  summarySheet.getRow(summaryHeaderRow).values = ['Residencia', 'Puesto', 'Personas con turno', 'Servicios mínimos', 'Huelga', 'Trabajan', 'Pendientes'];
  summarySheet.getRow(summaryHeaderRow).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summarySheet.getRow(summaryHeaderRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
  summarySheet.getRow(summaryHeaderRow).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  summarySheet.getRow(summaryHeaderRow).height = 30;

  group.asignaciones.forEach((assignment, index) => {
    const row = summaryHeaderRow + 1 + index;
    const residence = assignment.residencia.replace(/"/g, '""');
    const job = assignment.puesto.replace(/"/g, '""');
    summarySheet.getCell(`A${row}`).value = assignment.residencia;
    summarySheet.getCell(`B${row}`).value = assignment.puesto;
    summarySheet.getCell(`C${row}`).value = { formula: `COUNTIFS(Personal!C$6:C$${endRow},"${residence}",Personal!D$6:D$${endRow},"${job}")` };
    summarySheet.getCell(`D${row}`).value = { formula: `COUNTIFS(Personal!C$6:C$${endRow},"${residence}",Personal!D$6:D$${endRow},"${job}",Personal!J$6:J$${endRow},"Sí")` };
    summarySheet.getCell(`E${row}`).value = { formula: `COUNTIFS(Personal!C$6:C$${endRow},"${residence}",Personal!D$6:D$${endRow},"${job}",Personal!K$6:K$${endRow},"Huelga")` };
    summarySheet.getCell(`F${row}`).value = { formula: `COUNTIFS(Personal!C$6:C$${endRow},"${residence}",Personal!D$6:D$${endRow},"${job}",Personal!K$6:K$${endRow},"Trabaja",Personal!J$6:J$${endRow},"<>Sí")` };
    summarySheet.getCell(`G${row}`).value = { formula: `COUNTIFS(Personal!C$6:C$${endRow},"${residence}",Personal!D$6:D$${endRow},"${job}",Personal!K$6:K$${endRow},"",Personal!J$6:J$${endRow},"<>Sí")` };
    const fill = index % 2 === 0 ? 'FFFFFFFF' : 'FFF9FAFB';
    summarySheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  });

  summarySheet.columns = [
    { width: 24 }, { width: 34 }, { width: 20 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 14 },
  ];
  summarySheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  personalSheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const metadataSheet = workbook.addWorksheet('_TrAccion');
  metadataSheet.state = 'veryHidden';
  metadataSheet.addRows([
    ['Formato', 'TRACCION_HUELGA_RECOGIDA_V1'],
    ['Huelga ID', huelgaId],
    ['Fecha', fecha],
    ['Área', group.area],
    ['Responsable', group.responsableNombre],
    ['Email', group.responsableEmail],
    ['Personas', group.personal.length],
  ]);

  const rawBuffer = await workbook.xlsx.writeBuffer();
  return {
    fileName: `Seguimiento_huelga_${formatDateFile(fecha)}_${safeFilePart(group.area)}.xlsx`,
    buffer: workbookBufferToArrayBuffer(rawBuffer),
  };
}
