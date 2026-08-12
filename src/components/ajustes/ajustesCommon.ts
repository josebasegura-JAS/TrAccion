import type { ModuleHelpSection } from '../ModuleHelp';
import type { DatabaseStatusTone } from '../../services/databaseStatusView';

export const AJUSTES_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    body: 'Centraliza toda la configuración técnica de TrAccion: dónde vive la base de datos compartida, sus copias de respaldo, la carpeta de actualizaciones automáticas, las plantillas Word externas y las fases de Tareas.',
  },
  {
    title: 'Base de datos',
    items: [
      'Muestra la ruta activa de SQLite y su estado (correcto, aviso, error o bloqueado) para saber si TrAccion está trabajando contra la ubicación compartida esperada.',
      'Si otra persona tiene la base bloqueada (se muestra usuario, equipo y PID), normalmente se libera sola; "Forzar liberación" solo debe usarse si el bloqueo ha quedado colgado tras un cierre anómalo.',
      '"Compactar base de datos" libera en disco el espacio de registros ya borrados. Se ejecuta automáticamente como máximo una vez por semana al cerrar la app, y también se puede lanzar a mano; bloquea brevemente la escritura para el resto de equipos.',
    ],
  },
  {
    title: 'Copias de respaldo',
    items: [
      'TrAccion guarda copias locales automáticas (base SQLite + un JSON de emergencia). El JSON solo debe usarse si la base SQLite no es recuperable; no sustituye a la copia SQLite.',
      'Restaurar una copia crea antes un respaldo de la base activa y recarga la app para aplicar los datos restaurados.',
      'La copia diaria automática es configurable: se puede activar/desactivar, elegir cuántos días se conservan y, opcionalmente, guardar también en una carpeta secundaria (red, USB u otro equipo) como protección extra.',
    ],
  },
  {
    title: 'Carpeta de actualizaciones',
    items: [
      'Es la carpeta de red donde se publican las nuevas versiones del .exe de TrAccion junto a un version.txt.',
      'Al arrancar, la app comprueba esa carpeta y, si hay una versión más nueva, pregunta antes de actualizarse.',
    ],
  },
  {
    title: 'Plantillas Word externas',
    items: [
      'Guardan solo la ruta (local, UNC o unidad mapeada) de los documentos DOCX externos que usan otros módulos para generar sus escritos: Teletrabajo, Licencia sin sueldo y Vinculograma.',
      'La plantilla no se copia dentro de TrAccion: la app abre el DOCX de esa ruta en el momento de generar el documento, así que si se mueve o renombra el fichero hay que actualizar la ruta aquí.',
    ],
  },
  {
    title: 'Fases de tareas',
    items: [
      'Define las fases disponibles para clasificar las tareas del módulo Tareas (por ejemplo, las fases que alimentan Comité y Paritaria).',
      'Desactivar una fase evita que se seleccione en tareas nuevas, pero conserva el histórico y las tareas ya existentes con esa fase.',
    ],
  },
  {
    title: 'Diagnóstico de integridad',
    items: [
      'Comprueba, sin modificar nada, la integridad física de SQLite (PRAGMA integrity_check), la versión de esquema, el tamaño de la base, las copias de seguridad disponibles, los bloqueos caducados sin liberar y algunas referencias cruzadas conocidas (por ejemplo, personas de Ticket Restaurante con calendario inexistente).',
      'Se ejecuta solo cuando pulsas "Ejecutar diagnóstico ahora"; no corre en segundo plano ni corrige nada automáticamente.',
      '"Exportar informe" descarga el resultado en JSON para adjuntarlo si necesitas ayuda a distancia.',
    ],
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Comprobar primero que la aplicación está conectada a la base de datos correcta.',
      'Revisar rutas de copias, actualizaciones y plantillas solo si ha cambiado la ubicación real.',
      'Actualizar la configuración necesaria y guardar los cambios.',
      'Evitar tocar Ajustes durante importaciones o escrituras críticas en otros módulos.',
    ],
  },
];

export function databaseTone(tone: DatabaseStatusTone): 'success' | 'warning' | 'error' | 'muted' {
  if (tone === 'ok') {
    return 'success';
  }

  if (tone === 'error') {
    return 'error';
  }

  if (tone === 'locked') {
    return 'muted';
  }

  return 'warning';
}

export function noticeTone(message: string): 'success' | 'warning' | 'error' | 'muted' {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes('no se ha podido') ||
    normalizedMessage.includes('solo está disponible')
  ) {
    return 'error';
  }

  if (normalizedMessage.includes('restaurando') || normalizedMessage.includes('fallback')) {
    return 'warning';
  }

  if (
    normalizedMessage.includes('guardada') ||
    normalizedMessage.includes('actualizada') ||
    normalizedMessage.includes('restaurada')
  ) {
    return 'success';
  }

  return 'muted';
}

export function formatBackupSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatBackupDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('es-ES');
}

export function formatBytesAsMb(sizeBytes: number): string {
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
