export const TELETRABAJO_TEMPLATE_NOT_CONFIGURED_MESSAGE =
  'No existe una plantilla de Teletrabajo configurada.';
export const TELETRABAJO_TEMPLATE_UNAVAILABLE_MESSAGE =
  'La plantilla configurada no se encuentra disponible.';
export const TELETRABAJO_TEMPLATE_INVALID_TYPE_MESSAGE =
  'La ruta configurada debe apuntar a un archivo DOCX.';
export const LICENCIA_SIN_SUELDO_TEMPLATE_NOT_CONFIGURED_MESSAGE =
  'No existe una plantilla de Licencia sin sueldo configurada.';
export const LICENCIA_SIN_SUELDO_TEMPLATE_UNAVAILABLE_MESSAGE =
  'La plantilla de Licencia sin sueldo configurada no se encuentra disponible.';


export function normalizeTemplatePath(path: string): string {
  return path.trim();
}

export function isDocxPath(path: string): boolean {
  return normalizeTemplatePath(path).toLowerCase().endsWith('.docx');
}

export function validateConfiguredTeletrabajoTemplatePath(path: string): string {
  const normalizedPath = normalizeTemplatePath(path);

  if (!normalizedPath) {
    throw new Error(TELETRABAJO_TEMPLATE_NOT_CONFIGURED_MESSAGE);
  }

  if (!isDocxPath(normalizedPath)) {
    throw new Error(TELETRABAJO_TEMPLATE_INVALID_TYPE_MESSAGE);
  }

  return normalizedPath;
}

export function validateConfiguredLicenciaSinSueldoTemplatePath(path: string): string {
  const normalizedPath = normalizeTemplatePath(path);

  if (!normalizedPath) {
    throw new Error(LICENCIA_SIN_SUELDO_TEMPLATE_NOT_CONFIGURED_MESSAGE);
  }

  if (!isDocxPath(normalizedPath)) {
    throw new Error(TELETRABAJO_TEMPLATE_INVALID_TYPE_MESSAGE);
  }

  return normalizedPath;
}
