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
/**
 * PR498: reviewed native-opening inventory, grounded in the quality-lane
 * artifact from PR497 (14 native-open matches / 13 files). This policy is
 * intentionally an explicit review list, not a claim of runtime coverage.
 * A NEW constructor, unknown file or changed native-opening count blocks CI
 * until the route is individually reviewed. Function/call matching is
 * heuristic; the limits are documented in the report.
 *
 * 'recovery-only' verifies evidence under a supervisor-owned exclusive
 * barrier and must NOT blindly inherit the main ownership fence.
 */
const nativeOpenPolicy = {
  'electron/detachedCriteriaWriterWorker.ts': {count:1,owner:'experimental-write-child',gate:'not connected to production; supervised handoff required',status:'NO-GO'},
  'electron/detachedWriterCommitReceipt.ts': {count:1,owner:'recovery-verifier',gate:'confirmed child exit + independent SMB recovery barrier',status:'NO-GO'},
  'electron/isolatedSyncTokensWorker.ts': {count:1,owner:'readonly-child',gate:'isolatedSyncTokensBridge + confirmed exit',status:'ADMISSION GUARDED'},
  'electron/jsonReadWorker.ts': {count:1,owner:'readonly-child',gate:'jsonReadWorkerBridge + confirmed exit',status:'ADMISSION GUARDED'},
  'electron/persistence/databaseActivation.ts': {count:1,owner:'main-activation',gate:'tracked activate lifecycle + protected openSqliteDatabase',status:'ADMISSION GUARDED'},
  'electron/persistence/databaseIdentity.ts': {count:1,owner:'main-direct-write',gate:'PR497 main fence; caller lifecycle + startup lock',status:'ADMISSION GUARDED'},
  'electron/persistence/sqliteBackupValidation.ts': {count:1,owner:'main-backup-check',gate:'PR497 main fence + tracked restore lifecycle',status:'ADMISSION GUARDED'},
  'electron/persistence/sqliteConnection.ts': {count:2,owner:'main-native-open',gate:'PR496 main ownership fence before native constructor',status:'ADMISSION GUARDED'},
  'electron/persistence/sqliteHealthVerification.ts': {count:1,owner:'readonly-health-child',gate:'isolated health worker lifecycle; verify exit and admission',status:'REVIEW REQUIRED'},
  'electron/persistence/sqliteIntegrityVerification.ts': {count:1,owner:'recovery-verifier',gate:'independent preflight/recovery barrier; not main fence',status:'NO-GO'},
  'electron/persistence/taskBatchPersistence.ts': {count:1,owner:'main-autonomous',gate:'PR task batch freeze + openSqliteDatabase fence',status:'ADMISSION GUARDED'},
  'electron/sessionReadWorker.ts': {count:1,owner:'readonly-child',gate:'sessionReadWorkerBridge + confirmed exit',status:'ADMISSION GUARDED'},
  'electron/taskReadWorker.ts': {count:1,owner:'readonly-child',gate:'taskReadWorkerBridge + confirmed exit',status:'ADMISSION GUARDED'},
};
const actualNativeOpens = findings.filter(x=>x.kind==='native-open');
const nativeCounts = new Map();
for (const entry of actualNativeOpens) {
  nativeCounts.set(entry.file, (nativeCounts.get(entry.file)??0)+1);
}
const policyViolations = [];
for (const [file,count] of nativeCounts) {
  const reviewed=nativeOpenPolicy[file];
  if (!reviewed) policyViolations.push(`Nueva apertura SQLite sin revisar: ${file} (${count})`);
  else if (reviewed.count!==count) policyViolations.push(
    `Cambió el número de aperturas SQLite de ${file}: ${count} vs ${reviewed.count}`);
}
for (const [file, reviewed] of Object.entries(nativeOpenPolicy)) {
  if ((nativeCounts.get(file)??0)!==reviewed.count && !nativeCounts.has(file)) {
    policyViolations.push(`Desapareció una apertura clasificada: ${file}; revisar y actualizar el contrato`);
  }
}
const nativeAudit = {
  scope:'heuristic native-open matches only; not exhaustive ownership proof',
  totalOccurrences:actualNativeOpens.length,
  classifiedFiles:Object.keys(nativeOpenPolicy).length,
  productionHandoffReady:false,
  routes:actualNativeOpens.map(x=>({
    file:x.file,line:x.line,excerpt:x.excerpt,
    owner:nativeOpenPolicy[x.file]?.owner??'UNREVIEWED',
    gate:nativeOpenPolicy[x.file]?.gate??'UNKNOWN',
    status:nativeOpenPolicy[x.file]?.status??'NO-GO',
  })),
  violations:policyViolations,
};
mkdirSync(path.join(root,'audit-results'),{recursive:true});
writeFileSync(path.join(root,'audit-results/sqlite-native-open-review.json'),
  JSON.stringify(nativeAudit,null,2));
console.log(`PR498: ${actualNativeOpens.length} aperturas heurísticas, ${nativeCounts.size} archivos, ${policyViolations.length} desviaciones; handoff NO-GO.`);
for (const violation of policyViolations) console.error(violation);
if (policyViolations.length>0) process.exitCode=1;

// A classification entry is descriptive only; the native-open audit above
// is the strict regression gate and intentionally keeps NO-GO statuses.
for (const [file, review] of Object.entries(nativeOpenPolicy)) {
  if (!known[file]) known[file] = {
    owner:review.owner,
    mode:review.owner==='main-direct-write'||review.owner==='experimental-write-child'
      ? 'write' : 'readonly / native-open',
    admission:review.gate,
    disposition:review.status==='ADMISSION GUARDED' ? 'PROTEGIDA PARCIAL'
      : review.status==='NO-GO' ? 'BLOQUEADO' : 'EN REVISIÓN',
    note:'Registro de apertura revisado por archivo. No certifica cierre de todos los handles.',
  };
}
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

// PR494: every bridge that forks a dedicated readonly SQLite utilityProcess
// must reserve the global main handoff barrier before launching the child.
const isolatedReaders = [
  ['electron/taskReadWorkerBridge.ts', 'tasks'],
  ['electron/sessionReadWorkerBridge.ts', 'sessions'],
  ['electron/jsonReadWorkerBridge.ts', 'json'],
  ['electron/isolatedSyncTokensBridge.ts', 'sync-tokens'],
];
for (const [file, kind] of isolatedReaders) {
  const source = readFileSync(path.join(root, file), 'utf8');
  if (!source.includes(`runIsolatedSqliteReadUnderHandoffBarrier('${kind}', () =>`) ||
      !source.includes('utilityProcess.fork(')) {
    console.error(`Lector SQLite independiente no reservado antes de fork: ${file}`);
    process.exitCode = 1;
  }
}
// PR495: direct consumers of maintenance functions must not bypass the
// main SQLite ownership fence and independent-activity freeze.
const vacuum = readFileSync(path.join(root, 'electron/persistence/vacuumMaintenance.ts'), 'utf8');
for (const route of ['vacuumDatabase', 'runScheduledVacuumIfDue', 'getVacuumStatus']) {
  if (!vacuum.includes(`export function ${route}(`)) {
    console.error(`Falta la entrada protegida de mantenimiento SQLite: ${route}`);
    process.exitCode = 1;
  }
}
if (!vacuum.includes('sqliteEngineOwnershipFence.assertMayEnterMain()') ||
    !vacuum.includes('sqliteIndependentActivityTracker.run(label, operation)') ||
    !vacuum.includes("runVacuumUnderHandoffBarrier('sqlite:vacuum-full'") ||
    !vacuum.includes("runVacuumUnderHandoffBarrier('sqlite:vacuum-scheduled-full'") ||
    !vacuum.includes("runVacuumUnderHandoffBarrier('sqlite:vacuum-status-full'")) {
  console.error('VACUUM: falta la admisión obligatoria al motor SQLite.');
  process.exitCode = 1;
}
// PR496: shared native-open primitive must reject any new handle after
// ownership has left main. This does not prove other direct constructors safe.
const nativeOpen = readFileSync(path.join(root,'electron/persistence/sqliteConnection.ts'),'utf8');
const openEntrypoint = nativeOpen.slice(nativeOpen.indexOf('export function openSqliteDatabase('));
if (!nativeOpen.includes("import { sqliteEngineOwnershipFence } from '../sqliteEngineOwnershipFence.js'") ||
    !openEntrypoint.includes('sqliteEngineOwnershipFence.assertMayEnterMain();') ||
    openEntrypoint.indexOf('sqliteEngineOwnershipFence.assertMayEnterMain();') >
      openEntrypoint.indexOf("require('better-sqlite3')")) {
  console.error('Punto central de apertura SQLite sin comprobación de propiedad previa a apertura nativa.');
  process.exitCode = 1;
}
// An inventory classification is not proof of exhaustive admission.
// Report any unclassified native-open path explicitly as NO-GO evidence.
const unclassifiedNativeOpenFiles = [...new Set(findings
  .filter(x => x.kind === 'native-open' && !known[x.file])
  .map(x => x.file))].sort();
writeFileSync(path.join(root,'audit-results/sqlite-native-open-pending.json'),
  JSON.stringify({unclassifiedNativeOpenFiles,productionHandoffReady:false},null,2));
console.log(`PR496: aperturas nativas sin clasificación previa: ${unclassifiedNativeOpenFiles.length}; handoff producción NO-GO.`);
// PR497: direct native handles in main used for identity bootstrapping and
// backup validation MUST check ownership before opening better-sqlite3.
for (const [file, fn] of [
  ['electron/persistence/databaseIdentity.ts', 'inspectAndEnsureDatabaseIdentity'],
  ['electron/persistence/sqliteBackupValidation.ts', 'validateSqliteBackupForRestore'],
]) {
  const source = readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf(`export function ${fn}(`);
  const body = start >= 0 ? source.slice(start) : '';
  const check = body.indexOf('sqliteEngineOwnershipFence.assertMayEnterMain();');
  const nativeOpen = body.indexOf("require('better-sqlite3')");
  if (!source.includes("import { sqliteEngineOwnershipFence } from '../sqliteEngineOwnershipFence.js'") ||
      start < 0 || check < 0 || nativeOpen < 0 || check > nativeOpen) {
    console.error(`Apertura SQLite directa sin comprobación de propiedad previa: ${file}`);
    process.exitCode = 1;
  }
}
const backup=readFileSync(path.join(root,'electron/persistence/localBackupService.ts'),'utf8');
const facade=readFileSync(path.join(root,'electron/sqlitePersistence.ts'),'utf8');
if (!backup.includes("'sqlite:backup-live-full'") ||
    !backup.includes("'sqlite:backup-shutdown-full'") ||
    !backup.includes('sqliteIndependentActivityTracker.run(label, operation)') ||
    !backup.includes("return await trackActivity('sqlite:backup-live-full'") ||
    !backup.includes("return await trackActivity('sqlite:backup-shutdown-full'") ||
    !backup.includes("trackActivity('sqlite:backup-manual-lifecycle', createManualLocalBackup)") ||
    !backup.includes("trackActivity('sqlite:backup-list-prune', listLocalBackups)") ||
    !backup.includes("trackActivity('sqlite:backup-restore-lifecycle', () => restoreLocalBackup(fileName))") ||
    !facade.includes('trackActivity: (label, operation) => sqliteIndependentActivityTracker.run(label, operation)')) {
  console.error('Falta la admisión obligatoria de un backup SQLite; no permitir un fallback sin tracker.');
  process.exitCode=1;
}
