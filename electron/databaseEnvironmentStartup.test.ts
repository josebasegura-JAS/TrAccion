import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const mock = vi.hoisted(() => ({
  root: '',
  choice: 0,
  folder: '',
  secondChoice: 0,
  messages: [] as string[],
}));

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => {
      if (key !== 'userData') throw new Error('Unexpected path');
      return mock.root;
    },
    setPath: (_key: string, value: string) => { mock.root = value; },
  },
  dialog: {
    showMessageBoxSync: (options: { title: string }) =>
      options.title.includes('Base de pruebas') ? mock.secondChoice : mock.choice,
    showOpenDialog: async () => ({canceled:false,filePaths:[mock.folder]}),
    showErrorBox: (_title: string, message: string) => {mock.messages.push(message);},
  },
}));

vi.mock('./databaseEnvironmentChoice.js', () => ({
  promptDatabaseEnvironment: async () =>
    mock.choice === 0 ? 'production' : mock.choice === 1 ? 'test' : null,
}));
import { selectDatabaseEnvironmentBeforeMain } from './databaseEnvironmentStartup.js';
import { getConfiguredDatabaseDirectory } from './persistence/databasePreferences.js';

let workspace = '';
beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(),'traccion-environment-selector-'));
  mock.root = path.join(workspace,'profile');
  mkdirSync(mock.root);
  mock.folder = path.join(workspace,'testing-db');
  mkdirSync(mock.folder);
  mock.choice = 0;
  mock.secondChoice = 0;
  mock.messages = [];
});
afterEach(() => {
  rmSync(workspace,{recursive:true,force:true});
  delete process.env.TRACCION_DATABASE_ENVIRONMENT;
});

describe('PR507 · entorno al arrancar', () => {
  it('producción conserva sin cambios el perfil y su configuración existente', async () => {
    const original = path.join(mock.root,'sqlite-preferences.json');
    writeFileSync(original,JSON.stringify({customDirectoryPath:'X:/prod',expectedDatabaseUuid:'prod-id'}));
    expect(await selectDatabaseEnvironmentBeforeMain()).toBe('production');
    expect(mock.root).toBe(path.join(workspace,'profile'));
    expect(await getConfiguredDatabaseDirectory()).toEqual({
      directoryPath:'X:/prod',isDefaultPath:false,
    });
    expect(JSON.parse(readFileSync(original,'utf8'))).toMatchObject({
      customDirectoryPath:'X:/prod',expectedDatabaseUuid:'prod-id',
    });
  });

  it('pruebas utiliza otro perfil y la carpeta elegida, sin copiar la identidad de producción',async()=>{
    writeFileSync(path.join(mock.root,'sqlite-preferences.json'),
      JSON.stringify({customDirectoryPath:path.join(workspace,'production'),expectedDatabaseUuid:'private-id'}));
    mock.choice = 1;
    expect(await selectDatabaseEnvironmentBeforeMain()).toBe('test');
    expect(mock.root.endsWith('-test-environment')).toBe(true);
    const prefs = JSON.parse(readFileSync(path.join(mock.root,'sqlite-preferences.json'),'utf8'));
    expect(prefs).toMatchObject({customDirectoryPath:mock.folder,expectedDatabaseUuid:null});
    expect(await getConfiguredDatabaseDirectory()).toEqual({
      directoryPath:mock.folder,isDefaultPath:false,
    });
    expect(process.env.TRACCION_DATABASE_ENVIRONMENT).toBe('test');
  });

  it('conserva la identidad UUID al reutilizar una base de pruebas existente',async()=>{
    mock.choice = 1;
    const profile = mock.root + '-test-environment';
    mkdirSync(profile);
    writeFileSync(path.join(profile,'sqlite-preferences.json'),
      JSON.stringify({customDirectoryPath:mock.folder,expectedDatabaseUuid:'test-uuid-123'}));
    expect(await selectDatabaseEnvironmentBeforeMain()).toBe('test');
    const saved = JSON.parse(readFileSync(path.join(profile,'sqlite-preferences.json'),'utf8'));
    expect(saved.expectedDatabaseUuid).toBe('test-uuid-123');
  });

  it('rechaza usar como pruebas exactamente la misma carpeta de producción',async()=>{
    const folder = path.join(workspace,'production');
    mkdirSync(folder);
    writeFileSync(path.join(mock.root,'sqlite-preferences.json'),
      JSON.stringify({customDirectoryPath:folder,expectedDatabaseUuid:'prod-id'}));
    mock.folder = folder;
    mock.choice = 1;
    expect(await selectDatabaseEnvironmentBeforeMain()).toBeNull();
    expect(mock.root).toBe(path.join(workspace,'profile'));
    expect(mock.messages.join(' ')).toContain('coincide');
  });

  it('cancelar no altera el perfil ni abre SQLite',async()=>{
    mock.choice = 2;
    expect(await selectDatabaseEnvironmentBeforeMain()).toBeNull();
    expect(mock.root).toBe(path.join(workspace,'profile'));
  });
});
