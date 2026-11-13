/**
 * PR9D-4C: lista cerrada de tablas de los módulos JSON simples.
 * Nunca se permite que el renderer elija una tabla o envíe SQL arbitrario.
 */
export const ISOLATED_JSON_TABLES = [
  'vinculograma_records',
  'licencia_sin_sueldo_records',
  'criterios_rrll_records',
  'acta_type_records',
  'ticket_restaurante_calendar_records',
  'ticket_restaurante_person_records',
  'ticket_restaurante_absence_records',
  'ticket_restaurante_manutencion_records',
  'especiales_recipient_records',
  'teletrabajo_puesto_records',
  'teletrabajo_grupo_cobertura_records',
  'job_position_translation_records',
] as const;
export type IsolatedJsonTable = typeof ISOLATED_JSON_TABLES[number];

export function isIsolatedJsonTable(name: string): name is IsolatedJsonTable {
  return (ISOLATED_JSON_TABLES as readonly string[]).includes(name);
}
