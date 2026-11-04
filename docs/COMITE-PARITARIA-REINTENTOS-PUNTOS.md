# Reintento de puntos históricos en Comité y Paritaria

## Problema corregido
La pantalla almacenaba todos los IDs solicitados en un Set. Si SQLite
respondía correctamente pero no encontraba un punto, ese ID quedaba
marcado para siempre y no volvía a consultarse durante la sesión.

## Solución
- Distinguir solicitudes en curso, puntos efectivamente encontrados y
  referencias todavía ausentes.
- Para cada ID que no se devuelve o cuya consulta falla, programar reintentos
  con espera progresiva de 30, 60, 120, 240 y máximo 300 segundos.
- No descargar jamás todo el histórico de Tareas: cada reintento sigue usando
  la consulta selectiva por IDs y los lotes existentes de 300.
- No consultar de nuevo en cada render ni emitir solicitudes duplicadas.
- Los puntos cargados correctamente se conservan en memoria. Los ausentes
  se consultarán de nuevo cuando venza el plazo, lo que permite recuperar
  elementos que aparezcan tras sincronización o reconexión Wi-Fi.

## Límites
Un ID eliminado definitivamente podrá seguir intentando recuperarse cada
cinco minutos mientras la pantalla permanezca abierta, sin afectar a la base
de datos. No se crean ni modifican registros, y los intervalos solo se
mantienen cuando hay referencias ausentes. Las consultas siguen dependiendo
de que SQLite compartido esté disponible.

## Pruebas operativas
1. Abrir Comité y Paritaria con puntos históricos válidos y comprobar títulos.
2. Forzar una respuesta vacía temporal desde copia de base, restaurar el punto
   y comprobar que vuelve a aparecer tras el reintento.
3. Desconectar/reconectar Wi-Fi mientras se solicita un punto: no debe
   desaparecer el contenido previamente recuperado.
4. Confirmar que un punto ausente no genera solicitudes en bucle continuo.
5. Confirmar que no se realizan escrituras y que abrir Históricos no descarga
   el historial general de Tareas.
