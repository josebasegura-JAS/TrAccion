# PR C — recuperación completa con límite y control de generación

## Diagnóstico
Cuando SQLite vuelve a responder, el monitor refresca el estado y **todos los
stores** antes de reactivar la edición. Si cualquiera de esas promesas nunca
termina, `checkInProgress` permanecía activo y el monitor dejaba de
comprobar la base. Un timeout superficial tampoco es suficiente: la operación
SMB puede continuar realmente después de que el renderer deje de esperarla.

## Cambios
- Límite de **60 segundos** para completar el refresco de recuperación.
- El monitor libera su estado `checkInProgress` al fallar o vencer el
  límite y continúa diagnosticando la base.
- Una recarga completa pendiente permanece reservada incluso después del
  timeout: **no se inicia otra encima** hasta que termine de verdad.
- Identificador de generación para cada recuperación. Un evento `offline`
  posterior o la detención del monitor invalida las recuperaciones antiguas.
  Una operación caducada jamás desbloquea edición ni publica `recovered`.
- Cuando por fin termina el trabajo antiguo, se programa una comprobación
  nueva. La edición solo se reactiva tras una verificación y una recarga
  completa **nuevas y satisfactorias**.
- Pruebas de recuperación normal, timeout con recarga pendiente, corte durante
  una recuperación y detención del monitor con trabajo anterior en curso.

## Limitaciones importantes
- Los 60 segundos son un límite de **espera del renderer**, no una cancelación
  real de `fs`, SQLite o del IPC.
- Mientras una operación SMB antigua no termine, se conservan las escrituras
  bloqueadas. Es una medida intencional de integridad, no un fallo del
  mecanismo de recuperación.
- Esta PR no modifica el acceso directo de varios equipos a SQLite sobre SMB.
- Los módulos y plantillas siguen intactos.

## Prueba integrada con PR #340 y #341
1. Fusionar #341 antes de la prueba general (la #340 ya está fusionada).
2. Fusionar esta PR solo con CI Windows integral en verde.
3. En una copia de base compartida, abrir Tareas en dos equipos; consultar,
   crear y modificar tareas alternando equipos.
4. Alternar cable / Wi-Fi, simular un corte durante guardado y comprobar que
   no se afirma éxito de una escritura sin confirmación.
5. Verificar que una espera corta de health-check no bloquea la edición
   (#340), que la recarga de Tareas se reintenta si falla (#341) y que una
   recuperación antigua no desbloquea (#342 o PR C correspondiente).
6. Tras un corte real, revisar los logs del monitor y la cola SQLite. Si
   una operación del sistema operativo nunca retorna, no forzar reintentos
   de escritura mientras el resultado sea indeterminado.
