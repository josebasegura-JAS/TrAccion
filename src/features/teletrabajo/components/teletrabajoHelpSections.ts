import type { ModuleHelpSection } from '../../../components/ModuleHelp';

export const TELETRABAJO_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Finalidad del módulo',
    body: 'Registra, revisa y controla las solicitudes de teletrabajo de cada periodo. Cada fila corresponde a una persona solicitante. Un semáforo automático avisa de incidencias, pero la validación final corresponde a RRLL.',
  },
  {
    title: 'Datos de cada solicitud',
    items: [
      'Nº de empleado y nombre: identifican a la persona. Si existe en Plantilla, la app toma sus datos actualizados (puesto, residencia, DNI...).',
      'Puesto organizativo: se usa para agrupar solicitudes y calcular la presencialidad. Si está mal, debe corregirse en Plantilla.',
      'Días solicitados: martes, miércoles y/o jueves. Son los días que entran en el cálculo de presencialidad.',
      'Tipo de solicitud (nueva/renovación), fecha de solicitud, fechas de entrega de ordenador y cascos.',
      'Estado, validaciones (seguridad informática, prevención, jefatura, Dirección), observaciones y revisado: sirven para seguimiento administrativo y control interno de RRLL.',
    ],
  },
  {
    title: 'Semáforo de la solicitud',
    items: [
      'Verde (sin incidencias): la antigüedad es correcta y se cumple la presencialidad mínima.',
      'Amarillo (revisar): falta algún dato para poder comprobar el caso (antigüedad sin informar, empleado no localizado en Plantilla, sin días marcados) o la presencialidad queda ajustada.',
      'Rojo (bloqueante): la persona no cumple la antigüedad mínima exigida, o el puesto no está configurado como teletrabajable, o falta el puesto organizativo en la solicitud.',
      'El semáforo comprueba primero la antigüedad; solo si esta es correcta pasa a comprobar la presencialidad mínima.',
    ],
  },
  {
    title: 'Requisito de antigüedad',
    items: [
      'Para poder teletrabajar, la persona debe llevar al menos 1 año en el puesto en la fecha de la solicitud.',
      'Se calcula con el campo "Antigüedad Puesto" de Plantilla frente a la fecha de solicitud de Teletrabajo.',
      'Si Plantilla no tiene informada esa fecha, o la persona no existe en Plantilla, la solicitud queda en amarillo (revisar) en lugar de bloquearse directamente.',
    ],
  },
  {
    title: 'Puestos Teletrabajo y Grupos de Cobertura',
    items: [
      'Solo los puestos dados de alta como "teletrabajables" (con su presencialidad mínima y, opcionalmente, dotación computable) entran en el cálculo; el resto queda bloqueado por "puesto no teletrabajable".',
      'Un Grupo de Cobertura agrupa varios puestos que deben cubrirse de forma conjunta: comparten una única presencialidad mínima y su dotación se suma, de modo que las solicitudes de cualquiera de esos puestos compiten por el mismo límite en vez de evaluarse puesto a puesto.',
      'Un puesto pertenece como máximo a un Grupo de Cobertura; si no pertenece a ninguno, se evalúa con su propia presencialidad mínima y dotación.',
      'La dotación total de personas del puesto/grupo se toma de la "dotación computable" configurada si está informada; si no, se cuenta el número real de personas activas de ese puesto/grupo en Plantilla.',
    ],
  },
  {
    title: 'Cálculo de peticiones',
    items: [
      '"Peticiones" significa número de personas del mismo puesto/Grupo de Cobertura que solicitan teletrabajo en el periodo.',
      'No significa número de días solicitados. Una persona que pide martes y jueves cuenta como una petición, no como dos.',
      'Todas las personas del mismo puesto/grupo muestran el mismo total de peticiones del periodo.',
      'Ejemplo: si cuatro personas del mismo puesto piden teletrabajo, la app muestra 4 peticiones aunque no pidan los mismos días.',
    ],
  },
  {
    title: 'Cálculo de presencialidad mínima',
    items: [
      'La presencialidad se comprueba por puesto/Grupo de Cobertura y por día concreto (martes, miércoles, jueves por separado).',
      'Fórmula: personas totales del puesto/grupo menos personas que teletrabajan ese día concreto.',
      'El resultado se compara con la presencialidad mínima configurada para ese puesto o, si pertenece a uno, para su Grupo de Cobertura.',
      'Ejemplo: dotación 7, mínimo 4. Si el martes teletrabajan 2, quedan 5 presenciales y no hay incidencia.',
    ],
  },
  {
    title: 'Cuándo aparece incidencia de presencialidad',
    items: [
      'Aparece incidencia si en martes, miércoles o jueves quedan menos personas presenciales que el mínimo exigido para ese puesto/grupo.',
      'Puede haber muchas peticiones sin incidencia si cada día concreto mantiene el mínimo presencial.',
      'La incidencia no depende solo del número total de solicitudes, sino de cómo se concentran por día.',
    ],
  },
  {
    title: 'Importación de encuesta e histórico',
    items: [
      'Importar encuesta: da de alta solicitudes nuevas a partir de las respuestas de una encuesta. Solo se importan las filas marcadas como "Sí"; requiere tener cargada antes la tabla de Traducción de puestos en Plantilla para resolver los puestos.',
      'Importar histórico: vuelca el histórico de campañas anteriores (con su propia estructura de cabeceras e informe favorable/denegado) para dejar constancia de periodos ya cerrados.',
      'Cada importador tiene un botón de muestra ("Muestra encuesta" / "Muestra histórico") que genera un Excel de ejemplo con las columnas exactas que reconoce cada importador.',
    ],
  },
  {
    title: 'Nuevo periodo (campaña)',
    items: [
      'El botón "Nuevo periodo" crea una campaña nueva (p. ej. "2027-2028") sin modificar ni borrar las solicitudes del periodo anterior.',
      'Con la opción de generar renovaciones activada, copia las solicitudes aprobadas o analizadas del periodo origen elegido, las marca como renovación, las deja en estado pendiente y limpia su revisión y validaciones — quedan listas para revisarse de cero en la campaña nueva.',
      'Sin esa opción, el periodo se crea vacío y las solicitudes se dan de alta a mano o por importación.',
    ],
  },
  {
    title: 'Cómo modificar datos que afectan al cálculo',
    items: [
      'Para cambiar días solicitados, abre la solicitud, marca o desmarca martes, miércoles y/o jueves y guarda.',
      'Para cambiar el puesto organizativo de una persona, corrígelo en Plantilla; Teletrabajo usará ese puesto en los cálculos posteriores.',
      'Para cambiar la presencialidad mínima, la dotación computable o los Grupos de Cobertura, usa el botón "Puestos Teletrabajo" del propio módulo.',
      'Al guardar cambios, se recalculan peticiones, presencialidad, semáforo y exportación a Dirección.',
    ],
  },
  {
    title: 'Exportación Excel para Dirección',
    items: [
      'La Excel consolida las solicitudes del periodo y aplica las mismas reglas de cálculo que la app (peticiones, presencialidad, Grupos de Cobertura).',
      '"Peticiones" representa personas solicitantes del puesto/grupo, no días solicitados.',
      'Las incidencias se calculan por día concreto frente a la presencialidad mínima.',
      'Si una fila tiene color general y una celda tiene color propio por otra condición, se conserva el color específico de la celda.',
    ],
  },
  {
    title: 'Revisión recomendada por RRLL',
    ordered: true,
    items: [
      'Comprobar que la persona y el número de empleado son correctos.',
      'Verificar que el puesto organizativo está bien asignado en Plantilla.',
      'Revisar que los días solicitados son los correctos.',
      'Comprobar el semáforo (antigüedad y presencialidad) y resolver los casos en amarillo o rojo.',
      'Actualizar estado, observaciones y validaciones.',
      'Marcar la solicitud como Revisada cuando la comprobación esté cerrada.',
    ],
  },
];
