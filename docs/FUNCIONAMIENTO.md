# TrAcción — Funcionamiento funcional

> Documento funcional de referencia. Revisado contra el código de TrAcción 1.2.137 (octubre de 2026).
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

- Actas centraliza documentos y seguimientos relacionados con actas.
- Los tipos y estados deben mantenerse mediante los maestros y reglas previstos por el módulo.
- La carga o vinculación de documentos no sustituye el seguimiento funcional asociado al acta.
- Los registros históricos deben seguir siendo consultables aunque el trabajo operativo sobre ellos haya finalizado.

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

- El módulo registra y sigue solicitudes/acuerdos de teletrabajo según sus estados.
- Las fechas y estados determinan qué elementos requieren atención.
- El histórico debe conservar las solicitudes finalizadas para consulta.
- Las operaciones del módulo no deben alterar Plantilla salvo en aquellos campos para los que exista una integración explícita.

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

## 12. Huelgas

### 12.1. Convocatoria

Cada huelga conserva sus datos básicos: fecha, sindicatos convocantes, tipo de jornada/paros y observaciones cuando proceda.

### 12.2. Personal del día

- Se importa el personal/turno correspondiente al día objeto de análisis.
- La información importada se contrasta con Plantilla para completar datos disponibles, como residencia.
- La importación de un día no debe modificar arbitrariamente el histórico de otra convocatoria.

### 12.3. Puestos, áreas y zonas

- **Área** representa la clasificación organizativa utilizada para agrupar personal.
- **Zona** representa la agrupación operativa utilizada para la recogida/comunicación del proceso.
- La relación área/zona puede disponer de reglas por defecto, pero debe poder revisarse.
- Editar un área no debe borrar innecesariamente la zona ya asignada.
- Cuando el usuario corrige una residencia y el flujo lo prevé, la corrección puede persistirse en Plantilla para futuras ocasiones.

### 12.4. Responsables y comunicaciones

- Las zonas pueden tener responsables/destinatarios configurados.
- Los correos se generan por zona a partir de plantillas editables y variables del proceso.
- La generación automática prepara la comunicación; el usuario debe poder revisar el resultado antes de su uso externo.

### 12.5. Excel de recogida

La exportación Excel resume la información necesaria para la recogida/gestión de la huelga, incluyendo agrupaciones por área según el diseño vigente. El Excel no sustituye el registro de la convocatoria en TrAcción.

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

- Gestiona el proceso anual con su configuración y participantes.
- Las rutas o ficheros dependientes del ejercicio deben respetar la parametrización anual.
- El histórico de un año no debe quedar mezclado con el del siguiente por utilizar una ruta fija no parametrizada.

---

## 15. Sorteos

- Permite definir participantes y ejecutar sorteos según el flujo previsto por el módulo.
- El resultado debe quedar claramente diferenciado de la lista previa de candidatos/participantes.
- Repetir o modificar un sorteo debe ser una acción deliberada, no una consecuencia de refrescar la pantalla.

---

## 16. Vinculograma

- Representa relaciones/vínculos entre personas o elementos según el modelo del módulo.
- Las relaciones son información estructurada, no meramente visual: la representación gráfica debe derivarse de los datos almacenados.
- Modificar la vista no debe alterar relaciones salvo que el usuario ejecute una acción de edición explícita.

---

## 17. Especiales

- Centraliza registros clasificados como especiales conforme a las categorías del módulo.
- Debe conservar su histórico y permitir mantenimiento sin mezclar estos registros con tareas ordinarias salvo que exista un vínculo explícito.

---

## 18. Criterios RRLL

- Funciona como repositorio estructurado de criterios de Relaciones Laborales.
- Debe facilitar localizar el criterio vigente y su contexto sin depender de conocimiento informal del equipo.
- La edición de un criterio debe ser deliberada y conservar la información necesaria para comprender el contenido aplicable.

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

Antes de modificar una regla funcional existente:

1. comprobar este documento y `DECISIONS.md`;
2. contrastar el comportamiento con el código y tests actuales;
3. distinguir bug de comportamiento deliberado;
4. añadir o actualizar tests para la casuística afectada;
5. actualizar este documento si cambia el contrato funcional;
6. actualizar la ayuda visible si el cambio afecta al flujo del usuario.

Una nueva funcionalidad no se considera completamente cerrada si el código, los tests, la ayuda visible y la documentación funcional describen comportamientos distintos.
