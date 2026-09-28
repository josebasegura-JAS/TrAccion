import type { ModuleHelpSection } from '../../../components/ModuleHelp';

export const TICKET_RESTAURANTE_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Gestiona el ciclo completo del Ticket Restaurante: personas y calendarios, ausencias, manutenciones, deudas y ajustes, cálculo del pedido, registro de lo realmente solicitado, cotización y balance anual. El cálculo previsto y el pedido realmente realizado se conservan como conceptos distintos.',
  },
  {
    title: 'Proceso mensual de trabajo',
    flowSteps: [
      {
        title: 'Preparar la base',
        action: 'Revisa calendarios, personas con derecho y precio vigente. El Cómputo mensual se abre por defecto en el mes siguiente; Ausencias trabaja sobre el mes actual.',
        check: 'TrAcción utiliza las personas que existían en el mes consultado y el calendario y precio aplicables a ese periodo.',
        result: 'La base queda preparada para calcular el pedido sin alterar meses históricos.',
      },
      {
        title: 'Cargar ausencias',
        action: 'Importa el fichero de Zerkos → Supervisión → Justif. Ausencias de Día y revisa los registros importados.',
        check: 'El motivo se contrasta con Tipos ausencia para decidir si descuenta. Duplicados y solapes se controlan antes del cálculo.',
        result: 'Las ausencias quedan registradas aunque su tipo no descuente tickets.',
      },
      {
        title: 'Revisar incidencias',
        action: 'Comprueba manutenciones, deuda arrastrada, deuda manual, regularizaciones y posibles bajas ENF/ACC.',
        check: 'Las exclusiones mensuales, tickets cargados durante una baja y cuotas de deuda se aplican sin generar deuda ficticia.',
        result: 'El cálculo refleja la situación conocida antes de lanzar el pedido.',
      },
      {
        title: 'Revisar el pedido',
        action: 'En Cómputo mensual revisa persona a persona. Si existe una excepción, usa Ajustar pedido o Excluir del pedido.',
        check: 'El ajuste cambia el pedido efectivo pero no crea ni elimina deuda. La exclusión mensual deja el pedido a cero y conserva la deuda previa.',
        result: 'Obtienes el pedido que realmente quieres enviar al proveedor.',
      },
      {
        title: 'Registrar pedido',
        action: 'Cuando hayas enviado el pedido, pulsa Registrar pedido realizado.',
        check: 'Se guarda una fotografía del pedido: tickets, precio e importe por persona. Cambios posteriores en el cálculo no reescriben esa fotografía.',
        result: 'Queda constancia de lo que realmente se solicitó, separado del cálculo actual.',
      },
      {
        title: 'Registrar movimientos',
        action: 'Durante el mes utiliza Movimiento de pedido para pedidos adicionales o correcciones posteriores.',
        check: 'Los movimientos pueden ser positivos o negativos, guardan motivo, tickets e importe y no modifican automáticamente la deuda.',
        result: 'El módulo mantiene el total realmente solicitado y su diferencia frente al cálculo.',
      },
      {
        title: 'Cotizar y cerrar',
        action: 'A mes vencido revisa Cómputo cotización y utiliza Balance anual para el seguimiento del ejercicio.',
        check: 'Cotización calcula el consumo imputable al propio mes; Balance anual conserva la visión acumulada y permite cerrar/reabrir el ejercicio.',
        result: 'Pedido, cotización e histórico anual quedan trazables sin mezclar sus finalidades.',
      },
    ],
  },
  {
    title: 'Tipos de ausencia: la regla que manda',
    items: [
      'Tipos ausencia define si cada motivo importado descuenta o no Ticket Restaurante. La regla se aplica también al recalcular ausencias históricas.',
      'TEX está configurada como motivo que no descuenta. Una TEX puede permanecer visible en el histórico sin reducir tickets ni generar deuda.',
      'Los nuevos códigos detectados en las importaciones se incorporan al listado para poder configurar su comportamiento.',
      'La edición individual de una ausencia sigue disponible para revisar casos concretos, pero el maestro de tipos mantiene el criterio general del motivo.',
    ],
  },
  {
    title: 'Ausencias, ENF/ACC y exclusiones',
    items: [
      'Las ausencias con fecha Desde anterior al 01/03/2026 no se tienen en cuenta. La Fecha inicio cómputo deuda determina desde cuándo empiezan a arrastrarse ausencias al pedido.',
      'Si existe ENF o ACC activa en la fecha de cálculo, TrAcción puede sugerir excluir a la persona del pedido. La sugerencia nunca excluye automáticamente.',
      'Excluir del pedido es mensual: deja el pedido de ese mes a cero, pero no desactiva a la persona ni elimina la deuda que ya tuviera.',
      'Durante una exclusión no se genera deuda ficticia por todos los días de baja. Si realmente se cargaron tickets durante la baja, indica cuántos: esa es la cantidad recuperable.',
      'Cuando una ENF/ACC termina, TrAcción puede detectar una posible alta. La sugerencia simula la reincorporación en el mes siguiente con el mismo motor del Cómputo mensual, sin modificar automáticamente la exclusión guardada.',
    ],
  },
  {
    title: 'Deuda, manutenciones y regularizaciones',
    items: [
      'Deuda arrastrada es el saldo pendiente procedente de meses anteriores. Si no puede descontarse completa por falta de tickets disponibles, el resto continúa al mes siguiente.',
      'La deuda manual puede distribuirse en cuotas. Si un mes está excluido, la cuota se desplaza al siguiente mes disponible para evitar perderla o duplicarla.',
      'Una regularización establece el saldo correcto desde ese punto sin borrar el origen histórico; debe quedar acompañada de su motivo.',
      'Las manutenciones se imputan al mes elegido al guardar y descuentan solo cuando corresponden a una persona con derecho y a un día que generaría ticket según calendario.',
      'Las manutenciones afectan al pedido mensual, no al Cómputo cotización.',
    ],
  },
  {
    title: 'Cálculo, ajuste y pedido real',
    items: [
      'Cálculo automático = resultado de calendario, manutenciones, deuda y demás reglas del módulo.',
      'Ajustar pedido = excepción manual antes de enviarlo. Conserva el cálculo automático, el valor final y el motivo; no genera ni elimina deuda por sí mismo.',
      'Pedido realizado = fotografía de lo efectivamente enviado al proveedor. Guarda tickets, precio e importe y no cambia aunque después se modifiquen incidencias.',
      'Movimiento de pedido = modificación posterior al pedido inicial. Un valor positivo añade tickets y uno negativo registra una corrección o anulación.',
      'Total solicitado = pedido inicial realizado + movimientos posteriores. La diferencia frente al cálculo permite detectar rápidamente desviaciones.',
      'Un movimiento posterior no se convierte automáticamente en deuda: pedido real y deuda son conceptos independientes.',
    ],
  },
  {
    title: 'Cómputo mensual vs. Cómputo cotización',
    items: [
      'Cómputo mensual = pedido al proveedor. Parte del calendario del mes y aplica deuda arrastrada, manutenciones, exclusiones y ajustes que correspondan.',
      'Cómputo cotización = consumo real imputable al propio mes. Resta las ausencias de ese mes, no arrastra deuda previa y no descuenta manutenciones.',
      'Las dos cifras pueden ser distintas sin que exista un error porque responden a finalidades diferentes.',
    ],
  },
  {
    title: 'Personas manuales',
    items: [
      'Se gestionan dentro de Cómputo mensual para excepciones que no deben formar parte de la base ordinaria con calendario.',
      'Los tickets se almacenan específicamente para el mes de trabajo (AAAA-MM). Introducir tickets en un mes no los replica automáticamente en el siguiente.',
      'Si la persona existe en Plantilla, TrAcción puede completar nombre, DNI y área; los datos inexistentes se tratan como vacíos en lugar de bloquear el proceso.',
      'Puedes decidir de forma independiente si una persona manual debe aparecer también en Cómputo cotización.',
    ],
  },
  {
    title: 'Balance anual e histórico',
    items: [
      'Balance anual se abre directamente desde la portada y agrupa tickets e importes por mes, persona y área.',
      'Las personas se consideran según su vigencia en cada mes, evitando incorporar a meses históricos a personas que todavía no pertenecían al módulo.',
      'Mientras el ejercicio está abierto, las correcciones y regularizaciones pueden actualizar el balance. Al cerrar el ejercicio se guarda una fotografía definitiva de los 12 meses.',
      'Si aparece una corrección posterior, puedes reabrir el ejercicio, modificar los datos y volver a cerrarlo.',
      'Cada mes utiliza el precio que le corresponde según su fecha de vigencia. Exportar Excel genera el detalle disponible para control anual.',
    ],
  },
  {
    title: 'Comprobaciones antes de dar el mes por cerrado',
    items: [
      'Revisa que los nuevos tipos de ausencia tengan configurado correctamente si descuentan o no.',
      'Comprueba las sugerencias ENF/ACC y confirma únicamente las exclusiones o reincorporaciones que correspondan realmente.',
      'Antes de registrar el pedido, revisa ajustes manuales, deuda y personas manuales. Después de registrarlo, usa movimientos en lugar de reescribir lo que se envió.',
      'Si el cálculo actual y el total realmente solicitado difieren, revisa el histórico de movimientos antes de interpretar la diferencia como deuda.',
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

