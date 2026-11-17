/**
 * PR502 — deterministic, fail-closed production-readiness report.
 *
 * A green CI suite is NOT a real Windows/SMB two-host test, nor a proof of
 * orphan termination across parent crashes. Emit machine-readable evidence
 * while keeping production activation NO-GO until separately authorized.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>readFileSync(path.join(root,p),'utf8');
const requiredFiles=[
  'electron/detachedWriterLifecycleSupervisor.ts',
  'electron/detachedWriterProcessStore.ts',
  'electron/detachedWriterRecoveryWorkflow.ts',
  'electron/receiptBackedWriterTransport.ts',
  'electron/exclusiveWriterRecoveryBarrier.ts',
  'electron/detachedWriterIntegralValidation.test.ts',
  'electron/detachedWriterRecoveryWorkflow.test.ts',
  'electron/exclusiveWriterRecoveryBarrier.test.ts',
  'electron/detachedWriterLifecycleSupervisor.test.ts',
  'electron/detachedWriterProcessStore.test.ts',
];
const missingFiles=requiredFiles.filter(p=>!existsSync(path.join(root,p)));

// These are the central production entry points currently used by TrAcción.
// This is a regression alarm, NOT a complete dynamic import or callgraph audit.
const productionEntrypoints=[
  'electron/main.ts',
  'electron/startup.ts',
  'electron/sqlitePersistence.ts',
];
const experimentalRuntimeNames=[
  'detachedWriterLifecycleSupervisor',
  'detachedWriterRecoveryWorkflow',
  'receiptBackedWriterTransport',
  'sqliteWriterHandoffCoordinator',
  'detachedCriteriaWriterWorker',
];
const forbiddenImports=[];
for(const entrypoint of productionEntrypoints){
  const content=read(entrypoint);
  // Look only at module specifiers; comments mentioning these paths do not
  // constitute a live import. Dynamic imports require separate code review.
  for(const match of content.matchAll(/\b(?:from\s*|import\s*\()\s*['"]([^'"]+)['"]/g)){
    const target=match[1];
    if(experimentalRuntimeNames.some(name=>target.includes(name))){
      forbiddenImports.push({entrypoint,target});
    }
  }
}
const checks=[
  {id:'tracked-native-open',status:'implemented',evidence:'PR496–499: native-open policy plus protected health child'},
  {id:'process-supervision',status:'implemented-experimental',evidence:'PR500: persistent marker, EXIT callback and quarantine'},
  {id:'atomic-commit-receipts',status:'implemented-experimental',evidence:'PR482–501: receipt-backed writes and verified reconciliation'},
  {id:'exclusive-smb-recovery',status:'implemented-experimental',evidence:'PR501–502: observed owner and heartbeat lifecycle'},
  {id:'integration-tests',status:'requires-ci-result',evidence:'Vitest real SQLite integration, not a physical SMB test'},
  {id:'independent-orphan-termination',status:'not-implemented',evidence:'No verified Windows cross-restart orphan termination mechanism'},
  {id:'durable-win32-crash-validation',status:'not-executed',evidence:'Real Windows power-loss and marker/journal durability trials required'},
  {id:'two-host-windows-smb',status:'not-executed',evidence:'Two physical Windows hosts, Wi-Fi/cable change and disconnect trials required'},
  {id:'complete-production-routing',status:'not-implemented',evidence:'Experimental writer not linked to production IPC'},
  {id:'production-activation-approved',status:'not-approved',evidence:'No explicit reviewed activation decision'},
];
const report={
  schemaVersion:1,
  scope:'repository source inspection, not runtime proof or physical SMB test',
  generatedFrom:'scripts/audit-detached-writer-readiness.mjs',
  productionHandoffReady:false,
  recommendation:'NO-GO',
  missingFiles,
  forbiddenImports,
  checks,
  note:'Automated green checks cannot satisfy the Windows/SMB and orphan-termination evidence requirements.',
};
const target=path.join(root,'audit-results');
mkdirSync(target,{recursive:true});
writeFileSync(path.join(target,'detached-writer-readiness.json'),JSON.stringify(report,null,2)+'\n');
const markdown=[
  '# TrAcción · Escritor SQLite aislado — evaluación de preparación',
  '',
  '**Decisión actual: NO-GO (escritor aislado desactivado).**',
  '',
  '> Informe estático de CI. No certifica exclusividad, recuperación tras caída de Windows ni pruebas con 2 equipos.',
  '',
  '| Requisito | Estado | Evidencia o bloqueo |',
  '|---|---|---|',
  ...checks.map(c=>`| ${c.id} | ${c.status} | ${c.evidence} |`),
  '',
  `Archivos obligatorios ausentes: ${missingFiles.length}`,
  `Imports experimentales en entradas productivas: ${forbiddenImports.length}`,
  '',
  '## Condiciones de cambio de NO-GO',
  '1. CI electron, web, calidad y Vitest verde en la misma revisión.',
  '2. Implementar y probar verificación independiente de huérfanos Windows tras crash.',
  '3. Probar en 2 equipos Windows contra una SQLite de prueba en SMB, con pérdida/reconexión de red y congelamientos.',
  '4. Auditar todas las rutas SQLite, la vida de los locks y el circuito real de IPC sin fallback inseguro.',
  '5. Aprobar expresamente activación y procedimiento de rollback después de evaluar la evidencia.',
  '',
].join('\n');
writeFileSync(path.join(target,'detached-writer-readiness.md'),markdown);
console.log(`PR502: readiness=NO-GO; missing=${missingFiles.length}; forbidden-imports=${forbiddenImports.length}`);
if(missingFiles.length||forbiddenImports.length){
  console.error('Error: faltan componentes obligatorios o el writer experimental ha sido conectado a producción.');
  process.exitCode=1;
}
