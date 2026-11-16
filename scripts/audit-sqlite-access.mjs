/**
 * PR468 · Inventario reproducible de accesos SQLite en código Electron.
 * No afirma clasificación exhaustiva ni seguridad de producción.
 * Se ejecuta en CI y deja un informe adjunto a audit-results.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fileNames = execFileSync('git', ['ls-files', '-z', '--', 'electron'], {
  cwd: root, encoding: 'utf8',
}).split('\0').filter(name => /\.(?:ts|tsx|js|mjs)$/.test(name) &&
  !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name) &&
  !name.includes('/__tests__/'));
const rules = [
  {kind:'native-open', re:/\b(?:new\s+(?:Database|BetterSqlite3|Ctor)\s*\(|openSqliteDatabase\s*\(|new\s+Ctor\s*\()/},
  {kind:'native-close',re:/\b(?:db|database|candidate|currentDatabase)\??\.close\s*\(/},
  {kind:'transaction',re:/\.transaction\s*\(/},
  {kind:'sql-write',re:/\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|REPLACE\s+INTO|VACUUM|CREATE\s+TABLE|DROP\s+TABLE)\b/i},
  {kind:'backup-restore',re:/\b(?:backupSqliteDatabase|restoreValidatedSqliteBackup|backupExistingDatabase|writeSharedSqliteBackup|\.backup\s*\()/},
  {kind:'migration',re:/\b(?:maybeMigrate\w*|migrateLegacy\w*|migrateLocalStorageSnapshot|schemaMigrations|runCurrentSqliteIpcAsWrite)\b/},
  {kind:'lock-heartbeat',re:/\b(?:acquireLock|withDatabaseOperationLock|startDatabaseLockHeartbeat|releaseLock|heartbeatDatabaseLock)\b/},
];
const findings = [];
for (const name of fileNames) {
  let source;
  try { source = readFileSync(path.join(root,name),'utf8'); }
  catch { continue; }
  const lines=source.split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    for(const rule of rules){
      if(rule.re.test(lines[i])){
        findings.push({file:name,line:i+1,kind:rule.kind,excerpt:lines[i].trim().slice(0,170)});
      }
    }
  }
}
findings.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line||a.kind.localeCompare(b.kind));
const counts = Object.fromEntries(rules.map(rule=>[rule.kind, findings.filter(f=>f.kind===rule.kind).length]));
const summary = [
  '# Inventario estático de accesos SQLite — TrAcción',
  '',
  '> Generado por scripts/audit-sqlite-access.mjs. Hallazgos heurísticos: no certifica ausencia de operaciones indirectas, dinámicas ni dependencias externas.',
  '',
  `Archivos Electron examinados: ${fileNames.length}. Coincidencias: ${findings.length}.`,
  '',
  '| Categoría | Coincidencias |',
  '|---|---:|',
  ...Object.entries(counts).map(([key,n])=>`| ${key} | ${n} |`),
  '',
  '| Archivo:línea | Categoría | Código encontrado |',
  '|---|---|---|',
  ...findings.map(f=>`| ${f.file}:${f.line} | ${f.kind} | \`${f.excerpt.replace(/\|/g,'\\|').replace(/\`/g,"'")}\` |`),
  '',
  '## Limitaciones',
  '- No identifica permisos reales de cada ruta ni demuestra que cada llamada esté bajo freeze/lock SMB.',
  '- La detección usa texto de archivos versionados, incluidas cadenas SQL y comentarios.',
  '- La próxima fase debe asignar propietario, barrera de admisión, acceso al lock y ciclo de vida a cada ruta; ningún hallazgo nuevo debe aceptarse sin clasificación.',
].join('\n');
const dir=path.join(root,'audit-results');
mkdirSync(dir,{recursive:true});
writeFileSync(path.join(dir,'sqlite-access-inventory.json'), JSON.stringify({
  generatedAt:new Date().toISOString(), fileCount:fileNames.length,counts,findings,
},null,2));
writeFileSync(path.join(dir,'sqlite-access-inventory.md'),summary);
console.log(`PR468: inventario SQLite: ${fileNames.length} archivos, ${findings.length} coincidencias. Informe: audit-results/sqlite-access-inventory.md`);
// Control de regresión explícito para la ruta autónoma identificada.
// No se interpreta como cobertura del resto del inventario.
const batchPath=path.join(root,'electron/persistence/taskBatchPersistence.ts');
const batch=readFileSync(batchPath,'utf8');
if (!batch.includes("sqliteIndependentActivityTracker.run('sqlite:task-batch-autonomous'") ||
    !batch.includes('sqliteEngineOwnershipFence.assertMayEnterMain()') ||
    !/return runTaskBatchUnderHandoffBarrier\(\(\) => performSaveTaskRecordsAtomically\(records\)\)/.test(batch)) {
  console.error('ERROR: el escritor autónomo de Tareas ha perdido la barrera de admisión SQLite.');
  process.exitCode=1;
}
