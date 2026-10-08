TrAccion - Incremental: generación Word de denegación de Licencia sin sueldo

Cambios incluidos:
- Nueva ruta compartida en Ajustes: "Licencia sin sueldo — denegación".
- La ruta se guarda en la configuración compartida SQLite y es retrocompatible con configuraciones anteriores.
- Al cambiar una "Licencia sin sueldo" a estado "Denegada" y guardar, se genera automáticamente el Word de no concesión.
- Las solicitudes denegadas muestran "Word denegación" para poder regenerar el documento posteriormente.
- La concesión existente, Excedencias, prórrogas y el resto de módulos no se modifican.
- Se reutiliza exactamente el mismo mapa de variables de la plantilla de concesión.

Ficheros modificados: 6.

Validación realizada:
- Plantilla "Borrador - No Concesión.docx" comprobada: contiene Nombre_Completo, Nombre_Corto, Puesto_CAST, Puesto_EUS, Fecha_Solicitud, Fecha_Inicio, Fecha_Fin y D/M/A.
- El typecheck completo no se puede certificar en este entorno porque el ZIP fuente no incluye node_modules; los errores observados corresponden a dependencias ausentes (React, lucide-react, @types/node, etc.).
