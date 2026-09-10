import type { ModuleHelpSection } from '../../../components/ModuleHelp';

export const TICKET_RESTAURANTE_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Gestiona de principio a fin el Ticket Restaurante: base de personas y calendarios, incidencias mensuales, pedido, cotización y seguimiento anual. La portada indica el siguiente paso recomendado y permite entrar directamente al Balance anual.',
  },
  {
    title: 'Proceso completo de trabajo',
    flowSteps: [
      {
        title: 'Preparar la base',
        action: 'Revisa calendarios, personas con derecho y precio vigente del ticket.',
        check: 'TrAccion comprueba que exista al menos un calendario activo, personas activas y un precio aplicable al mes.',
        result: 'La base queda preparada para calcular el pedido mensual.',
      },
      {
        title: 'Cargar ausencias',
        action: 'Importa el fichero de Zerkos → Supervisión → Justif. Ausencias de Día y revisa los registros del mes.',
        check: 'Solo se incorporan ausencias con impacto real en Ticket Restaurante y se controlan duplicados y solapes.',
        result: 'Las ausencias válidas alimentan la deuda del pedido y el cálculo de cotización.',
      },
      {
        title: 'Cargar manutenciones',
        action: 'Importa o añade manualmente las notas de gasto y confirma el mes al que deben imputarse.',
        check: 'TrAccion valida la persona y si el gasto afecta realmente a un día que generaría ticket.',
        result: 'Las manutenciones aplicables descuentan en el Cómputo mensual del mes de imputación.',
      },
      {
        title: 'Revisar ajustes',
        action: 'Comprueba deudas y regularizaciones manuales antes de cerrar el pedido.',
        check: 'Se mantiene trazabilidad de motivos, cuotas pendientes, anulaciones y correcciones del saldo calculado.',
        result: 'El pedido queda ajustado a la situación real conocida.',
      },
      {
        title: 'Generar pedido',
        action: 'Entra en Cómputo mensual, revisa persona a persona y genera el fichero “A cargar”. Las Personas manuales se añaden aquí.',
        check: 'Los tickets manuales se guardan por clave año-mes; solo computan en el mes en el que los introduces.',
        result: 'Obtienes el pedido mensual y su importe con el precio vigente de ese periodo.',
      },
      {
        title: 'Revisar cotización',
        action: 'A mes vencido, revisa el Cómputo cotización para conocer los tickets realmente devengados en ese mes.',
        check: 'La cotización usa las ausencias del propio mes y no arrastra deuda de meses anteriores.',
        result: 'Dispones del dato mensual para cotización y retribución, separado del pedido al proveedor.',
      },
      {
        title: 'Analizar el año',
        action: 'Abre Balance anual desde la portada o desde la barra de navegación del módulo.',
        check: 'Agrupa tickets e importes por mes, persona y área. Mientras el ejercicio está abierto, cualquier regularización a mes vencido actualiza el balance; al cerrar el año, el histórico queda fijado.',
        result: 'Tienes el acumulado anual, gráficos y un Excel de control con cuatro hojas.',
      },
    ],
  },
  {
    title: 'Cómputo mensual vs. Cómputo cotización',
    items: [
      'Cómputo mensual = pedido al proveedor. Parte del calendario del mes y descuenta deuda arrastrada, manutenciones imputadas y ajustes aplicables.',
      'Cómputo cotización = consumo real imputable al mes. Resta las ausencias que caen en ese propio mes, no arrastra deuda previa y no descuenta manutenciones.',
      'Por eso ambas cifras pueden ser distintas sin que exista un error: responden a finalidades diferentes.',
    ],
  },
  {
    title: 'Personas manuales',
    items: [
      'Se gestionan dentro de Cómputo mensual para excepciones que no deben formar parte de la base ordinaria con calendario.',
      'Los tickets se almacenan específicamente para el mes de trabajo (AAAA-MM). Introducir 17 tickets en septiembre no genera 17 tickets en octubre.',
      'Si la persona existe en Plantilla, TrAccion puede completar nombre, DNI y área; si algún dato antiguo de Plantilla no existe, el módulo lo trata como vacío en lugar de bloquearse.',
      'Puedes decidir de forma independiente si esa persona manual debe aparecer también en Cómputo cotización.',
    ],
  },
  {
    title: 'Ausencias y deuda',
    items: [
      'Las ausencias con fecha Desde anterior al 01/03/2026 no se tienen en cuenta.',
      'La Fecha inicio cómputo deuda define desde cuándo empiezan a arrastrarse ausencias al Cómputo mensual.',
      'Los motivos que no descuentan pueden configurarse por calendario.',
      'Una regularización corrige el saldo calculado sin borrar las ausencias originales y queda registrada con su motivo.',
      'Si una deuda no puede descontarse completa por falta de tickets disponibles, el pendiente se arrastra automáticamente.',
    ],
  },
  {
    title: 'Manutenciones',
    items: [
      'Antes de guardar una importación se elige expresamente el mes/año de imputación; la fecha del gasto no cambia por sí sola ese periodo.',
      'Solo se aceptan personas con derecho a ticket ya existentes en el módulo.',
      'Una manutención marcada como afecta ticket descuenta únicamente si la fecha correspondería a un día generador según el calendario.',
      'Las manutenciones afectan al pedido mensual, no al Cómputo cotización.',
    ],
  },
  {
    title: 'Balance anual',
    items: [
      'Se puede abrir directamente desde la portada de Ticket Restaurante mediante el acceso Balance anual, sin entrar antes en otra vista.',
      'En el año actual acumula únicamente hasta el mes presente; los meses futuros quedan a cero y no se presentan como previsión.',
      'La vista Personas muestra Enero-Diciembre, total de tickets, importe anual y meses con tickets. La vista Áreas agrupa personas, tickets, importe, peso sobre el total y media por persona.',
      'El área procede preferentemente de Dirección organizativa de Plantilla y, si no existe, de Unidad. Las personas manuales pueden guardar su propio área.',
      'Mientras el ejercicio está abierto, todos los meses siguen recalculándose y puedes incorporar tickets o regularizaciones a mes vencido.',
      'Cerrar ejercicio está disponible cuando el año ha terminado y guarda una fotografía definitiva de los 12 meses. Desde ese momento el histórico queda fijo.',
      'Si aparece una regularización posterior, puedes Reabrir ejercicio, modificar los datos necesarios y volver a cerrarlo después.',
      'Cada mes conserva el precio del ticket que le corresponde según su fecha de vigencia.',
      'Exportar Excel genera Resumen anual, Por persona, Por área y Detalle mensual.',
    ],
  },
  {
    title: 'Precio e histórico',
    items: [
      'El precio del ticket admite varias vigencias. Al calcular un mes se aplica el precio que estuviera vigente en ese periodo.',
      'Cambiar el precio para meses futuros no modifica los importes de los meses que tengan otra vigencia de precio.',
      'Antes de cerrar un ejercicio conviene comprobar que los pedidos, tickets manuales y regularizaciones del año están revisados.',
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

