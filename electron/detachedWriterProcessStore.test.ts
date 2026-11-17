import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDetachedWriterProcessStore } from './detachedWriterProcessStore.js';

const folders:string[] = [];
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'traccion-pr500-store-'));
  folders.push(folder);
  const file=join(folder,'writer-process.json');
  return { file, store:createDetachedWriterProcessStore(file) };
}
afterEach(()=> { for(const dir of folders.splice(0)) rmSync(dir,{recursive:true,force:true}); });

describe('PR500 · durable writer process tombstone', () => {
  it('claims before fork and blocks a second process or parent restart, even after EXIT', () => {
    const {file,store}=fixture();
    const record=store.claim('database-1',10);
    expect(readFileSync(file,'utf8')).toContain(record.token);
    expect(()=> createDetachedWriterProcessStore(file).claim('database-1',11))
      .toThrow('sesión escritora previa');
    store.confirmExit(record,0);
    expect(store.inspect()).toMatchObject({
      state:'exit-confirmed',exitCode:0,generation:10,databaseUuid:'database-1',
    });
    expect(()=>createDetachedWriterProcessStore(file).claim('database-1',11))
      .toThrow('sesión escritora previa');
  });

  it('does not infer a dead worker from stale metadata, nor clear a corrupt marker', () => {
    const {file,store}=fixture();
    store.claim('database-1',1);
    expect(()=>createDetachedWriterProcessStore(file).claim('database-2',2))
      .toThrow('sesión escritora previa');
    writeFileSync(file,'{truncated','utf8');
    expect(()=>createDetachedWriterProcessStore(file).inspect()).toThrow();
    expect(()=>createDetachedWriterProcessStore(file).claim('database-2',2))
      .toThrow('sesión escritora previa');
  });

  it('rejects stale or forged EXIT and does not replace the launch marker', () => {
    const {store}=fixture();
    const record=store.claim('db-1',1);
    expect(()=>store.confirmExit({...record,token:'another'},0)).toThrow('no coincide');
    expect(store.inspect()?.state).toBe('launching');
    expect(()=>store.confirmExit(record,Number.NaN)).toThrow('código válido');
    store.confirmExit(record,1);
    expect(()=>store.confirmExit(record,0)).toThrow('no coincide');
  });

  it('PR505: archiva solo una sesión realmente reconciliada, sin borrar evidencias', () => {
    const {file,store}=fixture();
    const marker=store.claim('database-1',9);
    expect(()=>store.archiveReconciled(marker)).toThrow('no conciliado');
    store.confirmExit(marker,1);
    expect(()=>store.archiveReconciled(marker)).toThrow('no conciliado');
    store.markReconciled(marker);
    expect(()=>store.archiveReconciled({...marker,token:'wrong'})).toThrow('no conciliado');
    const archived=store.archiveReconciled(marker);
    expect(readFileSync(archived,'utf8')).toContain(marker.token);
    expect(store.inspect()).toBeNull();
    const next=store.claim('database-1',10);
    expect(next.generation).toBe(10);
    expect(()=>store.archiveReconciled(marker)).toThrow('no conciliado');
    expect(readFileSync(file,'utf8')).toContain(next.token);
  });

  it('cannot claim an invalid generation or identity', () => {
    const {store}=fixture();
    expect(()=>store.claim(' ',1)).toThrow('inválidas');
    expect(()=>store.claim('database',0)).toThrow('inválidas');
  });
});
