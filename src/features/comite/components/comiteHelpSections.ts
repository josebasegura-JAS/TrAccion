import type { ModuleHelpSection } from '../../../components/ModuleHelp';

export const COMITE_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Gestiona las sesiones del Comité de Empresa: puntos de Tareas, preparación de la sesión, cierre e incorporación del resultado al módulo Actas.',
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Clasificar en Comité los puntos que llegan desde Tareas o desde la bandeja unificada.',
      'Crear o abrir la sesión e incorporar los puntos que se vayan a tratar.',
      'Ordenar y revisar los puntos mientras la sesión siga abierta.',
      'Al terminar la reunión, indicar qué puntos se han tratado y cerrar la sesión.',
      'Los puntos tratados cierran su tarea; los no tratados quedan disponibles para otra sesión. Después puede generarse el registro correspondiente en Actas.',
    ],
  },
  {
    title: 'Sesiones abiertas e histórico',
    items: [
      'Los puntos disponibles son tareas no cerradas cuya fase es "comité".',
      'Mientras la sesión está abierta pueden añadirse, quitarse y reordenarse puntos.',
      'Una sesión cerrada pasa al histórico y ya no permite modificar sus puntos.',
      'La importación desde Word permite recuperar sesiones antiguas y evita duplicados por código y fecha.',
    ],
  },
];

export const PARITARIA_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Gestiona las sesiones de la Comisión Paritaria: puntos de Tareas, preparación de la sesión, cierre e incorporación del resultado al módulo Actas.',
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Clasificar en Paritaria los puntos que llegan desde Tareas o desde la bandeja unificada.',
      'Crear o abrir la sesión e incorporar los puntos que se vayan a tratar.',
      'Ordenar y revisar los puntos mientras la sesión siga abierta.',
      'Al terminar la reunión, indicar qué puntos se han tratado y cerrar la sesión.',
      'Los puntos tratados cierran su tarea; los no tratados quedan disponibles para otra sesión. Después puede generarse el registro correspondiente en Actas.',
    ],
  },
  {
    title: 'Sesiones abiertas e histórico',
    items: [
      'Los puntos disponibles son tareas no cerradas cuya fase es "paritaria".',
      'Mientras la sesión está abierta pueden añadirse, quitarse y reordenarse puntos.',
      'Una sesión cerrada pasa al histórico y ya no permite modificar sus puntos.',
      'La importación desde Word permite recuperar sesiones antiguas y evita duplicados por código y fecha.',
    ],
  },
];

export const COMITE_PARITARIA_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve esta pantalla',
    body: 'Es la entrada común de Comité y Paritaria. Resume sesiones y puntos pendientes y permite clasificar tareas generales antes de abrir la gestión detallada de cada órgano.',
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Revisar la bandeja de entrada de puntos aún sin clasificar.',
      'Asignar cada punto a Comité o Paritaria según corresponda.',
      'Comprobar sesiones abiertas, puntos disponibles y próxima fecha en los paneles de cada órgano.',
      'Abrir Comité o Paritaria para preparar la sesión y gestionar sus puntos.',
      'Cerrar la sesión desde su gestión; el resultado queda disponible para Actas y los puntos no tratados vuelven a quedar pendientes.',
    ],
  },
  {
    title: 'Qué muestran los indicadores',
    items: [
      'Sesiones abiertas suma las sesiones actualmente abiertas de ambos órganos.',
      'Puntos pendientes cuenta las tareas abiertas ya clasificadas en Comité o Paritaria.',
      'La bandeja de entrada muestra tareas generales o peticiones todavía sin asignar a ninguno de los dos órganos.',
      'Los filtros Todos / Comité / Paritaria solo cambian la visualización de esta pantalla; no modifican ningún dato.',
    ],
  },
];
