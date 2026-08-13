import type { ModuleHelpSection } from '../../../components/ModuleHelp';

export const TICKET_RESTAURANTE_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Calcula cuántos Tickets Restaurante genera cada persona cada mes, a partir de su calendario, sus ausencias y sus notas de gasto (manutenciones), y permite cuadrar el pedido mensual con la cotización real.',
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Configurar calendarios: qué días de la semana generan ticket y qué fechas concretas quedan excluidas (festivos, cierres...).',
      'Dar de alta a las personas con derecho a ticket y asignar a cada una su calendario. Las excepciones sin calendario se gestionan como Personas manuales desde el Cómputo mensual.',
      'Cada mes: importar o revisar ausencias y notas de gasto (manutenciones) del periodo.',
      'Revisar Deudas y regularizaciones: ahí se ve la deuda arrastrada y se puede fijar un saldo real justificado si el cálculo automático no coincide con la situación real.',
      'Revisar "Cómputo mensual" para hacer el pedido del mes.',
      'Revisar "Cómputo cotización" para comprobar lo que realmente corresponde facturar ese mes y exportar o imprimir los resultados que necesite RRLL.',
    ],
  },
  {
    title: 'Calendarios: qué días generan ticket',
    items: [
      'Cada calendario define qué días de la semana (p. ej. lunes a viernes) generan ticket en general.',
      'Además admite marcar fechas concretas como "sin ticket" (festivos, cierres puntuales, etc.), que se restan aunque caigan en un día que normalmente sí genera ticket.',
      'Cada persona con derecho a ticket tiene asignado un único calendario; el cálculo mensual usa siempre el calendario de la persona.',
    ],
  },
  {
    title: 'Diferencia entre Cómputo mensual y Cómputo cotización',
    items: [
      'Cómputo mensual (el pedido del mes): parte de los días de calendario del mes y resta la deuda de ausencias arrastrada desde meses anteriores más las notas de gasto marcadas como "afecta ticket" e imputadas a ese mes. No resta directamente las ausencias del propio mes: esas pasan a formar parte de la deuda que se descontará en un mes posterior con días de calendario disponibles.',
      'Cómputo cotización (lo que realmente corresponde ese mes): días de calendario del mes menos las ausencias que caen dentro de ese mismo mes y descuentan ticket. No arrastra deuda de otros meses y no resta las notas de gasto (solo las muestra como referencia).',
      'Por eso el mismo mes puede mostrar cifras distintas en cada vista: el "Cómputo mensual" refleja lo que se pide a proveedor, y la "Cómputo cotización" lo que realmente se ha consumido ese mes en concreto.',
    ],
  },
  {
    title: 'Reglas de cálculo',
    items: [
      'Solo se calculan personas activas con derecho a ticket y con calendario asignado.',
      'Las ausencias con fecha "Desde" anterior al 01/03/2026 nunca se tienen en cuenta (límite fijo de la aplicación).',
      'La "Fecha inicio cómputo deuda" (configurable en Reglas de cálculo) marca desde cuándo empiezan a arrastrarse ausencias como deuda en el Cómputo mensual; por defecto es esa misma fecha, pero puede adelantarse o retrasarse.',
      'En "Motivos que no descuentan por calendario" se puede indicar, calendario por calendario, qué motivos de ausencia no restan ticket (p. ej. una liberación sindical).',
      'El precio del ticket admite un histórico de importes con fecha de vigencia: cada mes se calcula con el precio vigente en ese momento, sin afectar a meses anteriores.',
    ],
  },
  {
    title: 'Importación de ausencias',
    items: [
      'Para obtener el fichero en Zerkos: Supervisión → Justif. Ausencias de día → seleccionar las fechas del último mes → exportar a Excel.',
      'Se admiten dos formatos de fichero, detectados automáticamente: uno "limpio" con cabeceras propias, y el formato de exportación habitual de Zerkos.',
      'Solo se cargan ausencias que tengan impacto real en Ticket Restaurante: deben pertenecer a una persona activa con derecho a ticket y coincidir al menos con un día que genere ticket según su calendario. El resto se ignora.',
      'Las filas exactamente iguales a una ausencia ya guardada se cuentan como duplicadas y se ignoran.',
      'Si una ausencia importada se solapa en fechas con otra ya existente del mismo empleado y mismo motivo, la sustituye en lugar de duplicarla.',
      'Si el fichero no indica si la ausencia afecta al ticket, se asume que sí siempre que la fecha "Desde" sea igual o posterior al 01/03/2026.',
      'El botón "Modelo" genera un fichero de ejemplo con las columnas que reconoce el importador.',
    ],
  },
  {
    title: 'Notas de gasto (Manutenciones)',
    items: [
      'Se pueden importar desde un fichero de gastos (identifica quién paga y con quién se reparte la comida) o añadir manualmente indicando empleado y fecha.',
      'Antes de importar o añadir, hay que elegir el mes/año de imputación: todas las filas se guardan bajo ese mes, aunque la fecha del gasto sea otro día.',
      'Solo se importan personas que ya están dadas de alta como personas con derecho a ticket; el resto se ignoran.',
      'Una nota de gasto marcada como "afecta ticket" solo descuenta un ticket en el Cómputo mensual del mes de imputación, y únicamente si ese día generaría ticket según el calendario de la persona. No afecta al Cómputo cotización.',
    ],
  },
  {
    title: 'Deudas y regularizaciones',
    items: [
      'Muestra la deuda automática que llega a cada mes antes de aplicar el pedido.',
      'Si el saldo real no coincide con el calculado, puede regularizarse a cualquier valor (incluido 0) indicando obligatoriamente un motivo.',
      'La regularización no borra ni modifica las ausencias originales: queda registrada como corrección trazable y afecta al pedido mensual desde ese mes.',
      'La deuda manual sirve además para corregir tickets entregados de más sin crear ausencias ficticias.',
      'Se indica la persona, el total de tickets, el mes de origen, el primer mes de descuento y en cuántos meses repartir la deuda.',
      'Si una cuota no puede descontarse completa por falta de tickets disponibles, el pendiente se arrastra automáticamente.',
      'La deuda manual solo afecta al Cómputo mensual/pedido. No modifica el Cómputo cotización.',
      'Una deuda puede anularse con motivo; las cuotas ya aplicadas en meses anteriores no se alteran.',
    ],
  },
  {
    title: 'Cotización y exportación',
    items: [
      'La vista de cotización muestra, para el mes y calendario de cada persona, los tickets realmente generados y su importe. Las Personas manuales solo aparecen aquí si tienen marcada la opción Incluir en cotización, usando el mismo número de tickets introducido para ese mes.',
      'Permite revisar caso a caso antes de dar por bueno el mes.',
      'Los resultados pueden exportarse/imprimirse para su uso fuera de la aplicación.',
    ],
  },
];

export const MONTH_OPTIONS = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

