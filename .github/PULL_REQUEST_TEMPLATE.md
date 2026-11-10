## Resumen

<!-- Qué cambia y por qué. En un cambio funcional, explicar en lenguaje de usuario el antes y el después. -->

## Trazabilidad funcional — obligatoria en toda PR

Marca **una** opción y completa los datos cuando corresponda:

- [ ] **Cambio funcional:** he actualizado `docs/FUNCIONAMIENTO.md` para reflejar las reglas y excepciones que realmente cambia esta PR.
- [ ] **Sin cambios funcionales:** esta PR modifica exclusivamente documentación, infraestructura CI, pruebas sin cambio de comportamiento, estilo o refactor equivalente, por lo que no requiere alterar el contrato funcional.

**Módulos afectados:** <!-- p. ej. Tareas, Ticket Restaurante; o «ninguno» -->

**Secciones de `docs/FUNCIONAMIENTO.md` actualizadas:** <!-- n.º de sección o «no aplica» con motivo -->

**Regla / cálculo / flujo / estado anterior → nuevo:** <!-- cambios medibles y excepciones. «Sin cambios» si procede. -->

**Pruebas relevantes:** <!-- ficheros y casos comprobados; indicar qué no se pudo probar -->

## Revisión de impacto

- [ ] Se han comprobado cambios en históricos, importaciones, exportaciones y vínculos con otros módulos (o no aplica).
- [ ] Se ha revisado si la ayuda integrada «?» debe actualizarse; si cambia una operación visible, el texto está sincronizado o la deuda se explica.
- [ ] No se han creado reglas de negocio que contradigan el contrato funcional y sus tests.
- [ ] Se ha revisado el impacto multiusuario/SQLite si esta PR modifica escrituras, cálculos derivados o sincronización (o no aplica).

## Validación

<!-- Resultado de CI, pruebas manuales necesarias y cualquier limitación de validación. -->

> **Criterio de revisión:** no aceptar cambios funcionales sin actualizar el contrato o sin justificar expresamente por qué el comportamiento no ha cambiado. Este formulario guía la revisión humana; marcar casillas no sustituye a las pruebas.
