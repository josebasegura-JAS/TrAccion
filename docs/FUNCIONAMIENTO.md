# TrAcción — Contrato de funcionamiento por módulo

> Contrato funcional de referencia. Revisión selectiva contra el código de `main` (`1a70c9c5`, 10/11/2026). Las reglas que no se citan expresamente no se consideran revalidadas en esta revisión.
>
> Este documento describe **qué debe hacer la aplicación y qué reglas funcionales deben conservarse**. No sustituye a `ARCHITECTURE.md` (cómo está construida) ni a `DECISIONS.md` (por qué se adoptaron determinadas soluciones).

## 1. Principios generales

### 1.1. Finalidad

TrAcción es una aplicación de escritorio para centralizar procesos de Relaciones Laborales: plantilla, tareas, órganos de relación laboral, coordinación, documentación, seguimiento económico y otros procesos recurrentes.

### 1.2. Datos compartidos

- La fuente de trabajo ordinaria es la base SQLite compartida configurada para el equipo.
- Si la base compartida requerida no está disponible, la aplicación no debe permitir trabajar silenciosamente en una copia local como si los datos fueran compartidos.
- Las rutas y parámetros definidos como compartidos deben ser comunes para los usuarios de la aplicación.
- Las operaciones sensibles de mantenimiento de base de datos pertenecen a Ajustes y no forman parte del flujo ordinario de los módulos.

### 1.3. Trazabilidad

Siempre que un proceso tenga estado, histórico, seguimiento o resultado, debe conservarse la diferencia entre:

1. dato de origen;
2. cálculo o propuesta de TrAcción;
3. modificación manual deliberada;
4. resultado realmente ejecutado, cuando exista ese concepto.

No se debe sustituir silenciosamente un dato histórico por un cálculo posterior.

### 1.4. Plantilla como referencia transversal

Plantilla es el maestro de personas utilizado por distintos módulos para resolver identidad, número de empleado, residencia y otros datos laborales. Las modificaciones que un módulo persista expresamente en Plantilla deben quedar disponibles para el resto de módulos.

### 1.5. Cómo mantener este contrato

Este fichero es la **referencia funcional versionada en Git**: describe entradas, comportamientos, cálculos, estados, salidas y excepciones que deben conservarse. **No reemplaza las pruebas**; las reglas concretas deben contrastarse con la implementación y los tests de dominio antes de cambiarlas.

En toda PR que altere comportamiento de usuario, estados, reglas, importadores, exportaciones, cálculos o persistencia observable debe revisarse **este mismo archivo** y actualizar las secciones afectadas. Si se trata únicamente de CI, documentación, estilo o refactor equivalente, indicar expresamente «sin cambios funcionales» en la plantilla de PR; no añadir cambios vacíos al fichero. Una PR no queda funcionalmente documentada solo por mencionar el archivo.

Para cambios sensibles, registrar siempre: **entrada → regla/operación → resultado → excepciones → origen de la regla (ruta de código/test) → efecto en históricos**. Si se descubre discrepancia, corregir el contrato con evidencia o abrir una incidencia; no presentar una hipótesis como regla.

Secciones sin fórmula exacta: describen una invariancia funcional o un flujo; no deben interpretarse como especificación de todos sus cálculos internos.

---

## 2. Dashboard

- Resume información que requiere atención; no sustituye a los módulos de origen.
- Muestra indicadores de tareas, sesiones, actas, teletrabajo y licencias según los datos disponibles.
- «Pendiente de atención» prioriza incidencias y vencimientos y debe enlazar con el registro o módulo correspondiente.
- El calendario integra hitos procedentes de distintos módulos.
- Las notificaciones de nuevas tareas asignadas son avisos de descubrimiento: deben facilitar llegar a la tarea y no convertirse en una alerta repetitiva permanente una vez atendidas.

---

## 3. Plantilla

- Es el maestro principal de personas de TrAcción.
- Permite mantenimiento manual e importación desde Excel.
- El número de empleado es una referencia especialmente relevante para vincular información procedente de otros procesos.
- Los datos importados deben normalizarse sin perder innecesariamente modificaciones válidas ya mantenidas en TrAcción.
- Los módulos que consultan Plantilla deben hacerlo como referencia compartida, no mantener copias funcionalmente divergentes de una misma persona salvo que el proceso requiera una fotografía histórica.

---

## 4. Tareas

### 4.1. Concepto

Una tarea representa trabajo pendiente o realizado, con responsable, prioridad, fechas, descripción y seguimiento.

### 4.2. Seguimiento

- Una tarea puede acumular seguimientos sin sustituir el histórico anterior.
- El detalle debe permitir comprender qué se pidió, qué ha ocurrido y cuál es la situación actual.
- El refresco de la información no debe obligar al usuario a perder innecesariamente la posición de trabajo en listados largos.

### 4.3. Correo

Al incorporar un correo compatible, TrAcción puede utilizar remitente, asunto, fecha y contenido para enriquecer la tarea. El correo es información de apoyo; no debe borrar la información que el usuario haya introducido expresamente.

### 4.4. Vínculos

Las tareas pueden participar en otros procesos (por ejemplo Comité, Paritaria o Coordinación). Un vínculo no debe convertir dos registros distintos en uno: cada módulo conserva su propio registro y estado, compartiendo la referencia necesaria.

### 4.5. Salida

El detalle puede imprimirse o exportarse a Excel para uso externo sin modificar por ello el estado funcional de la tarea.

---

## 5. Actas

- **Entradas:** alta manual o registro vinculado al cierre de una sesión; tipo de acta, fechas, documento, alegaciones y destinatarios de comunicación.
- **Flujo ordinario:** `Pendiente de realizar` → `Pendiente de alegaciones` → `Pendiente de firma` → `Cerrada`. Una acta cerrada permanece en el histórico y puede reabrirse para corrección según las acciones disponibles.
- **Generar Outlook (borrador):** prepara un correo bilingüe de borrador, sin enviarlo; al completarse el flujo de preparación, se establece el estado de alegaciones y una fecha de referencia de **21 días** desde la generación. La cita «FIN ALEGACIONES» es un recordatorio de calendario, no una alegación ni prueba de envío.
- **Alegaciones:** se registran por sindicato, presentación, fecha y observación; el cierre del plazo y el cambio a firma no equivalen a que el documento ya esté firmado.
- **Firma:** el correo definitivo de Outlook prepara el envío para firma. Solo cuando se completa el proceso debe registrarse la versión final y cerrarse.
- **Salida:** documento/ruta vinculada, borradores y recordatorios Outlook, estados e histórico. La apertura del borrador no acredita envío de correo.
- **Origen y pruebas:** `src/features/actas/components/actasPage.helpers.tsx`, `src/features/actas/components/ActasPage.tsx` y tests del dominio/store de Actas.

---

## 6. Comité y Paritaria

### 6.1. Sesiones

- Comité y Paritaria gestionan sesiones con sus puntos, estados y seguimiento.
- Una sesión puede prepararse antes de celebrarse y completarse posteriormente con resultado y documentación.

### 6.2. Puntos y tareas

- Los puntos pueden relacionarse con tareas cuando procede.
- El vínculo permite trasladar información y seguimiento sin eliminar la identidad propia del punto ni de la tarea.
- Cerrar o modificar un elemento debe respetar las reglas explícitas de sincronización; no debe darse por hecho que cerrar una sesión equivale a cerrar todas las tareas relacionadas.

### 6.3. Histórico

Las sesiones cerradas forman parte del histórico y no deben desaparecer de la consulta ordinaria por haber dejado de estar abiertas.

---

## 7. Coordinación

Coordinación contempla tres ámbitos diferenciados: **Dirección**, **Otras áreas** y **Sindicatos**.

### 7.1. Reuniones

- Cada reunión tiene fecha y un conjunto de puntos.
- Un punto puede proceder de una tarea existente o ser un punto manual cuando el asunto todavía no está inventariado como tarea.
- Cuando el flujo lo permite, puede crearse una tarea nueva a partir del asunto tratado.
- La tarea no debe ser obligatoria en aquellos tipos de reunión donde el proceso admite puntos no inventariados.

### 7.2. Dirección

- Al crear una reunión, se incorporan sin duplicados las tareas abiertas marcadas para trasladar a Dirección y las clasificadas como «Tratar con Rosa» en estado o fase.
- Los puntos vinculados a tareas conservan la referencia a la tarea de origen para su seguimiento.


Las tareas identificadas para trasladar a Dirección pueden incorporarse al guion de la reunión. El guion puede completarse con puntos manuales.

### 7.3. Otras áreas

Debe permitir trabajar con la misma filosofía general que Dirección, adaptada a reuniones con otras áreas: tarea existente, nueva tarea o punto manual según proceda.

### 7.4. Sindicatos

- El seguimiento se organiza también por sindicato.
- Debe conservarse histórico de las reuniones y de los asuntos tratados.
- Los datos específicos del seguimiento sindical se mantienen en el registro de Coordinación aunque exista una tarea relacionada.

### 7.5. Salida

La exportación Excel representa la reunión y sus puntos en el momento de exportar. El fichero externo no es la fuente maestra del seguimiento.

---

## 8. Ticket Restaurante

Este módulo distingue deliberadamente entre **derecho/cálculo**, **ajuste previo** y **pedido realmente ejecutado**.

### 8.1. Periodos de trabajo

- El pedido se prepara normalmente para el **mes siguiente**.
- Las ausencias se trabajan normalmente sobre el **mes actual**, porque pueden afectar al pedido siguiente.
- El cambio diciembre → enero debe conservar correctamente el año.

### 8.2. Personas y vigencia histórica

- El cálculo de un mes debe utilizar las personas que correspondían a ese periodo, no simplemente todas las que estén activas hoy.
- Los cálculos históricos y el Balance anual deben aplicar el mismo criterio de vigencia temporal.

### 8.3. Días teóricos

El calendario determina los días teóricos con derecho según las reglas configuradas para la persona/periodo. Un día que no genera derecho teórico no puede volver a descontarse como si previamente hubiese generado un ticket.

### 8.4. Ausencias

- Las ausencias se importan y conservan como registros del proceso.
- Cada tipo de ausencia dispone de una regla maestra que indica si descuenta Ticket Restaurante.
- La regla maestra se aplica también al recalcular información histórica; no depende únicamente del valor que tuviera la ausencia el día de su importación.
- **TEX está configurada funcionalmente para no descontar tickets.**
- Puede existir una modificación individual deliberada cuando el caso concreto lo requiera.
- Ausencias solapadas no deben provocar que un mismo día se descuente dos veces.

### 8.5. ENF y ACC: baja y exclusión

- ENF y ACC pueden utilizarse para detectar que una persona continúa de baja en la fecha de referencia.
- La detección genera una **sugerencia**, no una exclusión automática irreversible.
- La exclusión es mensual: excluye a la persona del pedido de ese mes, pero no la desactiva globalmente.
- Durante un mes excluido, el pedido es 0 y la deuda anterior se conserva según las reglas del motor.
- Las ausencias del mes excluido no deben crear una deuda ficticia equivalente a todos los días teóricos.
- Si durante una baja se cargaron realmente tickets a la persona, el dato recuperable es el número de tickets realmente cargados que corresponda recuperar, no todos los días de ausencia por defecto.

### 8.6. Posible alta/reincorporación

- Si la información importada permite detectar el final de ENF/ACC, TrAcción puede proponer una posible reincorporación.
- Si existe fecha suficiente, la fecha probable de alta se obtiene a partir del fin del periodo de baja; si la evidencia no es suficiente debe presentarse como posible alta y requerir confirmación.
- La sugerencia de tickets para el siguiente pedido debe reutilizar el motor mensual real.
- Para calcular esa sugerencia se simula la reincorporación de la persona sin borrar previamente la exclusión guardada.
- El aviso debe ofrecer desglose suficiente para entender de dónde procede la cifra sugerida.

### 8.7. Manutenciones / hoja de gastos

Las cantidades procedentes de hoja de gastos se aplican conforme a las reglas del mes. Deben permanecer diferenciadas de las ausencias y de la deuda para que el usuario pueda explicar el resultado final.

### 8.8. Deuda

- La **deuda arrastrada** es la deuda procedente de periodos anteriores.
- Puede existir deuda manual/cuotas planificadas y regularizaciones explícitas.
- Una regularización establece deliberadamente el valor correcto de deuda a partir del punto indicado; debe quedar trazable con su motivo.
- Si toda la deuda no puede aplicarse en un mes, la parte pendiente continúa según las reglas de arrastre.
- Una exclusión no debe borrar silenciosamente deuda previa.

### 8.9. Fórmula explicativa

A efectos de lectura del usuario, el pedido debe poder explicarse mediante sus componentes, de forma equivalente a:

`días teóricos − hoja de gastos aplicada − deuda aplicada = cálculo del pedido`

Las reglas internas pueden requerir tratamiento adicional de arrastres, exclusiones y límites, pero la pantalla debe permitir reconstruir el resultado.

### 8.10. Ajuste manual previo al pedido

- El cálculo automático puede ajustarse manualmente por persona antes de ejecutar el pedido.
- El ajuste exige motivo y conserva el valor automático y el valor finalmente decidido.
- El ajuste cambia el pedido efectivo, pero **no crea ni elimina deuda automáticamente**.
- El ajuste puede retirarse para volver al cálculo automático.

### 8.11. Pedido realizado

- «Pedido realizado» registra una fotografía de lo que efectivamente se solicitó en ese momento.
- Debe conservar tickets por persona y, cuando estén disponibles, precio unitario e importe.
- Una modificación posterior de ausencias, deuda o configuración no debe reescribir retroactivamente esa fotografía.
- Por tanto:

`pedido calculado ≠ pedido ajustado ≠ pedido realizado`

pueden coincidir, pero representan conceptos distintos.

### 8.12. Movimientos posteriores

- Después del pedido inicial pueden registrarse movimientos adicionales.
- Un movimiento positivo representa tickets adicionales; uno negativo, una corrección/anulación.
- Debe conservar fecha, cantidad y motivo; cuando corresponda, persona, precio e importe.
- Los movimientos modifican el **total realmente solicitado**, no el pedido inicial histórico.
- Un movimiento de pedido **no genera ni elimina automáticamente deuda**.

### 8.13. Total real y control

El módulo debe permitir comparar al menos:

- cálculo actual;
- pedido inicial realizado;
- movimientos posteriores;
- total realmente solicitado;
- diferencia entre cálculo y realidad.

La diferencia es información de control y no debe convertirse automáticamente en una regularización de deuda.

### 8.14. Cotización y Balance anual

- Cotización es una vista económica del proceso y debe utilizar la misma población y reglas temporales que el cálculo correspondiente.
- Balance anual agrega los meses sin alterar los registros históricos que lo sustentan.

---

## 9. Teletrabajo

### 9.1. Entradas y flujo

- **Datos de entrada:** periodo/campaña, solicitudes (manuales o importadas), persona y puesto organizativo de Plantilla, días solicitados **martes, miércoles y jueves**, modalidad, antigüedad en el puesto, puestos teletrabajables, dotaciones y grupos de cobertura.
- **Flujo:** configurar periodo → incorporar solicitudes → validar incidencias/estado administrativo → revisar cobertura → exportar a Dirección. Los periodos anteriores se conservan; la generación de renovaciones debe dejar las nuevas solicitudes pendientes de revisión.
- **Regla de vínculo:** el puesto se resuelve en Plantilla; corregir el puesto debe realizarse allí, no inventando una equivalencia temporal en la solicitud.

### 9.2. Antigüedad mínima

Se requiere **un año en el puesto**. El cálculo utiliza la fecha `Antigüedad Puesto` de Plantilla y una referencia que **depende de la modalidad**:

- **Ordinaria:** 1 de septiembre del año de inicio del periodo.
- **Extraordinaria:** fecha válida de presentación de la solicitud.
- **Modalidad o fecha no resolubles / persona ausente / antigüedad ausente:** `sin-dato`, no cumplimiento supuesto.
- **Resultado:** `cumple` si la referencia es igual o posterior al primer aniversario de la fecha de antigüedad; en otro caso `no-cumple`.

Implementación: `src/features/teletrabajo/domain/antiguedad.ts`, con pruebas `antiguedad.test.ts`.

### 9.3. Peticiones y presencialidad

- **Peticiones:** contar **solicitudes activas** del mismo periodo y puesto/grupo, no la suma de días solicitados. Excluir solicitudes eliminadas, denegadas o desistidas.
- **Cobertura:** si el puesto pertenece a un grupo, utilizar la dotación y mínimo compartidos del grupo; de lo contrario, la configuración del propio puesto.
- **Cálculo por día:** `personas presenciales = dotación computable (o personas activas de Plantilla cuando no hay dotación configurada) − solicitudes activas de ese día`.
- **Comparación:** revisar si las personas presenciales quedan por debajo del mínimo exigido en cualquiera de los días solicitados. No basta comparar el total de solicitudes del periodo.
- **Semáforo:** prioriza la evaluación de antigüedad y combina el resultado con la condición de puesto teletrabajable, días informados y cobertura. Es una ayuda a RRLL, no una concesión automática definitiva.
- **Salida:** incidencias, estado de revisión, Excel para Dirección y datos históricos del periodo.

Implementación: `src/features/teletrabajo/domain/semaforo.ts`, `gruposCobertura.ts` y `exportDireccion.ts`, con pruebas de semáforo, grupos y exportación.

---

## 10. Licencias sin sueldo

- Registra solicitudes y su evolución hasta resolución/cierre.
- Deben mantenerse diferenciados solicitud, periodo solicitado, estado y resultado.
- Las licencias pendientes alimentan los indicadores/avisos correspondientes del Dashboard.
- Cerrar una solicitud no debe eliminar su histórico.

---

## 11. Presupuestos

- Permite trabajar con partidas/conceptos y construir simulaciones.
- Debe conservarse la diferencia entre escenarios simulados y la opción finalmente elegida.
- La exportación a Excel es una salida del proceso, no la fuente maestra.
- El detalle de Ticket Restaurante puede proyectarse por calendario/mes para apoyar el presupuesto sin modificar el cálculo operativo de Ticket Restaurante.

---

## 12. Huelgas — módulo retirado

**Estado: retirado del ejecutable.** Las funcionalidades históricas de gestión de huelgas que figuraban aquí **no describen la aplicación actual**. Su antigua especificación se conserva únicamente en el historial Git de este archivo. No crear incidencias ni nuevas pantallas suponiendo que esas funciones siguen disponibles. La gestión operativa de huelgas se realiza mediante un circuito externo al módulo retirado.

---

## 13. Ayuda Escolar

### 13.1. Entrada desde Outlook

- El flujo principal permite arrastrar un correo `.msg` con documentación adjunta.
- TrAcción intenta identificar a la persona utilizando los datos disponibles y Plantilla.
- La normalización de nombres debe tolerar diferencias razonables de acentos/tildes sin obligar a una búsqueda manual cuando la identidad sea inequívoca.

### 13.2. Persona y número de empleado

Plantilla es la referencia para resolver la persona y su número de empleado. Si la identificación automática no es suficiente, el usuario debe poder seleccionar la persona correcta.

### 13.3. «Envía en nombre de otro»

- Permite registrar documentación recibida desde un correo que no pertenece a la persona beneficiaria.
- En ese caso, el email del remitente no debe aprenderse/guardarse como email de la persona seleccionada por el mero hecho de haber enviado la documentación.
- Los archivos se asocian a la persona seleccionada.

### 13.4. Adjuntos

- Los adjuntos se guardan en la carpeta parametrizada para el año correspondiente.
- El nombre de archivo se basa en la persona y utiliza sufijos cuando sea necesario para evitar sobrescrituras.
- La existencia de un archivo externo no sustituye la marca funcional de documentación enviada/recibida en TrAcción.

### 13.5. Histórico

El módulo debe permitir distinguir y consultar la documentación ya enviada/registrada y los casos pendientes de identificación o resolución.

---

## 14. Lotería

- **Entradas:** ejercicio, dos números de décimo, cantidades encargadas, precio de campaña, participantes de Plantilla o externos, décimos asignados a cada persona y pagos (`efectivo`, `bizum`, `transferencia`).
- **Fases:** encargo → participantes → seguimiento/cobros → cierre; cada campaña conserva sus datos y arqueos por ejercicio. La campaña siguiente se abre expresamente tras confirmación, sin trasladar participantes o cobros como si fueran nuevos.
- **Cálculos:** `décimos solicitados = suma de décimos de ambos números de todos los participantes`; `disponibles por número = encargados − solicitados`; `importe de una persona = (décimos nº1 + décimos nº2) × precio por décimo`; `pendiente de cobro = suma de importes de participantes no pagados`.
- **Seguimiento:** oculta de la tabla de pagos a los participantes con cero décimos de ambos números. Los cobros en efectivo integran la caja física; Bizum y transferencia son cobros registrados **fuera** de la caja física.
- **Arqueo:** el primer esperado es `cobros en efectivo + entradas/salidas netas de caja`. En arqueos posteriores: `esperado = contado anterior + variación de cobros en efectivo desde el anterior arqueo + variación neta de movimientos de caja`. `diferencia = contado − esperado`. Guardar histórico de arqueos, movimientos y diferencias, sin confundirlo con la conciliación bancaria.
- **Cierre:** requiere marcar Seguimiento como revisado; si hay descuadres de existencias o cobros pendientes, **advierte y exige confirmación**, pero no los bloquea automáticamente.
- **Salidas:** correos de encargo y participantes, Excel de administración/campaña, seguimiento, arqueos e histórico anual.
- **Origen y tests:** `src/features/loteria/domain/loteria.ts`, `arqueos.ts`, `arqueos.test.ts`, `src/features/loteria/components/LoteriaPage.tsx`.

---

## 15. Sorteos

- **Entradas:** personas activas de Plantilla, título, fecha, número de ganadores y exclusiones activas (manuales o por premios anteriores).
- **Elegibilidad:** excluir del bombo a personas con exclusión activa. No ejecutar un sorteo si faltan datos obligatorios o se solicitan más ganadores que participantes disponibles.
- **Operación:** selección aleatoria **sin repetición** de tantos ganadores como se haya indicado. Un ganador crea una exclusión que impide volver a participar mientras siga vigente.
- **Resultado:** guardar título, fecha, ganadores y posiciones en histórico; borrar un sorteo permite decidir si se liberan o se conservan las exclusiones relacionadas. La visualización no vuelve a ejecutar el sorteo.
- **Salida:** histórico, exportación/impresión de resultados y exclusiones.
- **Origen y pruebas:** `src/features/sorteos/domain/sorteos.ts`, `src/features/sorteos/components/SorteosPage.tsx` y pruebas de dominio.

---

## 16. Vinculograma

- **Entradas:** persona de Plantilla, persona vinculada, fecha de solicitud y datos de la relación.
- **Vigencia:** `fecha de vencimiento = fecha de solicitud + 3 años`; no se edita manualmente. El vínculo es `Vigente` mientras no se haya superado el vencimiento y `Vencido` cuando se supera, salvo que conste revocación.
- **Revocación:** exige fecha y motivo; no equivale a eliminar sin rastro el registro.
- **Salidas:** consultas de vigentes/histórico, exportación e impresión; documento Word de declaración a partir de la plantilla configurada en Ajustes.
- **Origen y pruebas:** `src/features/vinculograma/domain/vinculograma.ts`, `src/features/vinculograma/components/VinculogramaPage.tsx` y pruebas asociadas.

---

## 16 bis. Actividades Externas

- **Entrada:** persona activa de Plantilla, identificada por número de empleado, nombre/apellidos, descripción de la actividad, fecha de solicitud y condición remunerada.
- **Estados:** `pendiente` → propuesta favorable a Comité de Dirección (`propuesta`) o rechazo por RRLL (`rechazada_rrll`); una propuesta pasa a autorización (`autorizada`) o denegación (`denegada`) por Comité. El rechazo/denegación necesita un motivo. **No** equiparar propuesta favorable con autorización final.
- Editar permite corregir la actividad, la fecha y el carácter remunerado, manteniendo la identidad de la persona y el historial de resolución y comunicación. Eliminar requiere confirmación.
- El borrador de Outlook incluye la resolución y las observaciones. Abrirlo no equivale a haberlo enviado: la confirmación de envío es una acción separada.
- Las operaciones se guardan en SQLite compartida con comprobación de concurrencia para evitar sobrescribir una modificación ajena.
- En Ajustes se configura la carpeta del Excel espejo `Actividades_Externas.xlsx`. Se regenera al crear, editar, eliminar, resolver o cambiar la comunicación y puede actualizarse manualmente.
- El Excel es una representación secundaria de los registros, no la fuente de verdad. Si falla su escritura, se informa sin revertir un cambio confirmado en SQLite.

---

## 17. Especiales

- **Finalidad:** gestionar destinatarios y comunicaciones especiales desde el módulo, con selección, plantillas y registros de envío.
- **Entradas:** personas/destinatarios configurados, datos de comunicaciones, plantillas HTML y, cuando proceda, mensajes de Outlook `.msg`.
- **Operación:** preparar y revisar comunicaciones a través de Outlook; la generación de un borrador no implica envío automático ni su confirmación.
- **Conservación:** mantener registros y configuraciones compartidas que utiliza el módulo, sin equipararlos a tareas salvo vínculo funcional explícito.
- **Origen:** `src/features/especiales/components/EspecialesPage.tsx` y servicios de importación/comunicación asociados.

---

## 18. Criterios RRLL

- **Entradas:** tema, texto del criterio, estado (`vigente`, `en revisión` o `archivado`), sentido (`aprobado`, `denegado` o sin clasificar), fecha, responsable y observaciones.
- **Obligatorios:** tema y criterio; los demás campos aportan clasificación y contexto.
- **Operación:** creación y edición con protección de concurrencia, consulta por filtros y búsqueda, importación de Excel/CSV/TSV/TXT con previsualización y selección de filas.
- **Vínculo:** puede originarse desde una tarea; la tarea y el criterio siguen siendo entidades distintas y conservan la relación, sin que crear un criterio exija cerrar la tarea.
- **Salida:** catálogo de criterios y precedentes para consultas posteriores.
- **Origen y pruebas:** `src/features/criterios-rrll/components/CriteriosRrllPage.tsx`, dominio y pruebas del repositorio.

---

## 19. Ajustes

### 19.1. Base de datos

- Permite configurar y comprobar la SQLite compartida.
- Debe identificar claramente la base utilizada y su estado.
- Los mecanismos de lock protegen frente a operaciones incompatibles; liberar un bloqueo es una operación de mantenimiento, no una acción rutinaria.

### 19.2. Backups

- TrAcción dispone de mecanismos de copia y restauración.
- Restaurar una copia es una operación sensible porque modifica el estado compartido; debe tratarse como mantenimiento consciente.
- La retención y ubicación de backups se rigen por la configuración correspondiente.

### 19.3. Rutas compartidas

Las rutas de Excel automáticos, plantillas Word, actualizaciones y otros recursos definidos como compartidos deben persistirse para el conjunto de usuarios cuando así esté previsto, evitando configuraciones divergentes por equipo.

### 19.4. Actualización de la aplicación

- La versión técnica utiliza el formato `MAJOR.MINOR.PATCH`.
- El ejecutable se mantiene estable dentro de cada rama como `Traccion MAJOR.MINOR.exe`.
- La distribución utiliza `Traccion MAJOR.MINOR.piz` y `version.json`.
- `version.json` conserva la versión exacta y la información necesaria para validar/aplicar la actualización, incluido SHA-256.
- Una instalación puede actualizar directamente a una rama `MINOR` o `MAJOR` posterior; no debe exigir versiones intermedias.
- El paquete debe corresponder a la rama `MAJOR.MINOR` declarada en el manifiesto antes de instalarse.
- Una actualización no debe dejar múltiples ejecutables antiguos cuando el flujo normal puede sustituir el existente. Si la sustitución no puede completarse, debe conservarse y relanzarse la versión actual.

---

## 20. Persistencia, multiusuario y refresco

- Los módulos que trabajan sobre datos compartidos deben persistir en SQLite conforme a la arquitectura vigente.
- Un guardado no debe darse visualmente por definitivo si la persistencia real ha fallado.
- Las pantallas deben reconstruir sus cálculos cuando cambien datos relevantes; cambiar de pestaña o de mes no debe ser un requisito oculto para obtener un resultado actualizado.
- En conflictos multiusuario se deben respetar los mecanismos de control de concurrencia previstos por la aplicación.
- Los estados puramente visuales pueden ser locales; los datos funcionales compartidos no deben depender únicamente del estado React de una sesión.

---

## 21. Exportaciones y documentos externos

- Excel, Word, impresión y correos son salidas o soportes del proceso salvo que un módulo indique expresamente que se trata de una importación.
- Generar/exportar un documento no debe cambiar por sí solo un estado funcional salvo que esa transición esté diseñada explícitamente.
- Los ficheros automáticos deben utilizar las rutas compartidas configuradas y, cuando corresponda, sobrescribir/actualizar conforme a la regla del módulo.

---

## 22. Regla para futuros cambios

**Revisión obligatoria en cada PR con cambios funcionales**: el autor debe marcar en `.github/PULL_REQUEST_TEMPLATE.md` el módulo afectado, el apartado actualizado de este contrato y las pruebas correspondientes. Las PR sin cambios funcionales pueden declarar expresamente que no aplican; no se debe tocar este fichero solo para satisfacer una casilla.

Antes de modificar una regla funcional existente:

1. comprobar este documento y `DECISIONS.md`;
2. contrastar el comportamiento con el código y tests actuales;
3. distinguir bug de comportamiento deliberado;
4. añadir o actualizar tests para la casuística afectada;
5. actualizar este documento si cambia el contrato funcional;
6. actualizar la ayuda visible si el cambio afecta al flujo del usuario.

Una nueva funcionalidad no se considera completamente cerrada si el código, los tests, la ayuda visible y la documentación funcional describen comportamientos distintos.
