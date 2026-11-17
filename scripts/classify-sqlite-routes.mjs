/**
 * PR469 · Clasificación incremental verificable de entradas SQLite.
 * Complementa el inventario de PR468; los ficheros desconocidos se marcan
 * PENDIENTE, nunca seguros por omisión.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const inventoryPath=path.join(root,'audit-results/sqlite-access-inventory.json');
if (!readFileSync(inventoryPath, 'utf8')) throw new Error('Ejecutar primero audit-sqlite-access.mjs');
const {findings}=JSON.parse(readFileSync(inventoryPath,'utf8'));
const known={
  'electron/sqlitePersistence.ts': {
    owner:'main', mode:'mixed', admission:'fence + maintenance gate + tracked operation lock',
    disposition:'EN REVISIÓN', note:'La fachada no garantiza por sí sola todas las llamadas directas y callbacks',
  },
  'electron/persistence/taskBatchPersistence.ts': {
    owner:'main-autonomous',mode:'write',admission:'runTaskBatchUnderHandoffBarrier, tracker antes del primer await',
    disposition:'PROTEGIDA',note:'Conexión separada, sigue requiriendo coordinación de propiedad SMB',
  },
  'electron/persistence/localBackupService.ts': {
    owner:'main-background',mode:'maintenance',admission:'trackActivity desde sqlitePersistence, copia viva y cierre completos',
    disposition:'PROTEGIDA PARCIAL',note:'Restauración, temporizadores y vías fuera de fachada requieren auditoría individual',
  },
  'electron/persistence/databaseLockManager.ts': {
    owner:'main-lock',mode:'SMB lease',admission:'instrumentación y lock de operaciones en caller',
    disposition:'EN REVISIÓN',note:'El child aún no mantiene el lease de forma demostrable',
  },
  'electron/detachedCriteriaWriterWorker.ts': {
    owner:'detached-child',mode:'write',admission:'solo preparatorio, no importado desde IPC de producción',
    disposition:'BLOQUEADO',note:'No activar sin cesión y lock SMB distribuido',
  },
  'electron/sqliteWriterHandoffCoordinator.ts': {
    owner:'coordinator-design',mode:'handoff',admission:'freeze/drain + cierre handle principal antes del child',
    disposition:'BLOQUEADO',note:'No conectado al runtime y sin lease verificado por el child',
  },
  'electron/persistence/simpleJsonModuleRepository.ts': {
    owner:'main-repository',mode:'mixed',admission:'safeDatabaseMigrationOperation/lock; carga puede migrar',
    disposition:'EN REVISIÓN',note:'Marcadores de migración y rollback requieren pruebas de consistencia',
  },
  'electron/persistence/teletrabajoRepository.ts': {
    owner:'main-repository',mode:'mixed',admission:'safeDatabaseOperation, carga con migración',
    disposition:'EN REVISIÓN',note:'Controlar flag de migración tras rollback individual',
  },
  'electron/persistence/sorteosRepository.ts': {
    owner:'main-repository',mode:'mixed',admission:'safeDatabaseOperation, carga con migración',
    disposition:'EN REVISIÓN',note:'Validar flag de migración tras rollback',
  },
  'electron/persistence/loteriaRepository.ts': {
    owner:'main-repository',mode:'mixed',admission:'safeDatabaseOperation, carga con migración',
    disposition:'EN REVISIÓN',note:'Asegurar migración bajo lock de escritura',
  },
  'electron/persistence/presupuestosWriteCore.ts': {
    owner:'shared-sql-core',mode:'write',admission:'transacción reutilizada por main y child',
    disposition:'EN REVISIÓN',note:'OCC con MAX(updated_at) puede ignorar soft-deletes',
  },
  'electron/persistence/vacuumMaintenance.ts': {
    owner:'main-maintenance',mode:'write',admission:'sqliteMaintenanceGate + SMB en la fachada',
    disposition:'EN REVISIÓN',note:'Comprobar rutas programadas y backup/restore',
  },
};
const files=[...new Set(findings.map(x=>x.file))].sort();
const rows=files.map(file=>{
  const detail=known[file];
  return {file,occurrences:findings.filter(x=>x.file===file).length,
    owner:detail?.owner??'SIN CLASIFICAR',mode:detail?.mode??'desconocido',
    admission:detail?.admission??'no verificada',
    disposition:detail?.disposition??'PENDIENTE',note:detail?.note??'Revisar puntos de entrada y dependencias'};
});
const counter={classified:rows.filter(x=>x.owner!=='SIN CLASIFICAR').length,
  pending:rows.filter(x=>x.owner==='SIN CLASIFICAR').length};
const text=[
  '# PR469 · Matriz incremental de rutas SQLite',
  '',
  '> Esta matriz identifica rutas por archivo. **No certifica cobertura del código ni ausencia de llamadas dinámicas.**',
  `Archivos con coincidencias: ${files.length}. Clasificados: ${counter.classified}. Pendientes: ${counter.pending}.`,
  '',
  '| Archivo | Dueño/ruta | Clase | Admisión | Estado | Observación |',
  '|---|---|---|---|---|---|',
  ...rows.map(x=>`| ${x.file} | ${x.owner} | ${x.mode} | ${x.admission} | ${x.disposition} | ${x.note} |`),
  '',
  '## Reglas de cierre',
  '- PROTEGIDA significa que la ruta de entrada observada participa en freeze/drain, no que el protocolo distribuido esté activado.',
  '- Sin clasificar implica NO-GO para el handoff. La matriz se completa por revisión de código y tests, nunca por heurística automática.',
  '- Comprobar que el informe no se queda vacío: un fallo del inventario previo hace fallar este paso.',
].join('\n');
mkdirSync(path.join(root,'audit-results'),{recursive:true});
writeFileSync(path.join(root,'audit-results/sqlite-route-classification.md'),text);
writeFileSync(path.join(root,'audit-results/sqlite-route-classification.json'),JSON.stringify({counter,rows},null,2));
console.log(`PR469: rutas con coincidencias: ${files.length}; clasificadas: ${counter.classified}; pendientes: ${counter.pending}`);
if(files.length===0 || !files.includes('electron/persistence/taskBatchPersistence.ts') ||
   !files.includes('electron/persistence/localBackupService.ts') ||
   !files.includes('electron/detachedCriteriaWriterWorker.ts')){
  console.error('Inventario SQLite vacío o faltan rutas críticas conocidas.');
  process.exitCode=1;
}

const backup=readFileSync(path.join(root,'electron/persistence/localBackupService.ts'),'utf8');
const facade=readFileSync(path.join(root,'electron/sqlitePersistence.ts'),'utf8');
if (!backup.includes("'sqlite:backup-live-full'") ||
    !backup.includes("'sqlite:backup-shutdown-full'") ||
    !backup.includes('sqliteIndependentActivityTracker.run(label, operation)') ||
    !backup.includes("return await trackActivity('sqlite:backup-live-full'") ||
    !backup.includes("return await trackActivity('sqlite:backup-shutdown-full'") ||
    !facade.includes('trackActivity: (label, operation) => sqliteIndependentActivityTracker.run(label, operation)')) {
  console.error('Falta la admisión obligatoria de un backup SQLite; no permitir un fallback sin tracker.');
  process.exitCode=1;
}
