import { describe, expect, it } from 'vitest';
import {
  isKnownBackupFileName,
  isLocalBackupFileName,
  isShutdownBackupFileName,
  localBackupKindFromFileName,
  resolveLocalBackupReference,
} from './backupReference';

/**
 * Tests sobre la clasificación de nombres de archivo de backup y, sobre
 * todo, sobre resolveLocalBackupReference: es la función que decide qué
 * ruta real de disco corresponde a un nombre de archivo elegido por el
 * usuario en la lista de Ajustes, y la que impide salir del directorio de
 * backups (path traversal). No depende de Electron ni del sistema de
 * archivos real: solo manipulación de strings y path.basename/path.join.
 */
describe('backupReference', () => {
  const localDir = '/data/sqlite-local-backup';
  const shutdownDir = '/data/sqlite-local-backup/shutdown';

  describe('clasificación de nombres', () => {
    it('reconoce el nombre fijo de la copia local en vivo (sqlite)', () => {
      expect(isLocalBackupFileName('traccion-local-backup.sqlite')).toBe(true);
    });

    it('reconoce el nombre fijo de la copia local en vivo (json)', () => {
      expect(isLocalBackupFileName('traccion-local-backup.json')).toBe(true);
    });

    it('reconoce las copias locales rotadas con timestamp', () => {
      expect(isLocalBackupFileName('traccion-local-backup-2026-06-23T10-00-00-000Z.sqlite')).toBe(true);
      expect(isLocalBackupFileName('traccion-local-backup-2026-06-23T10-00-00-000Z.json')).toBe(true);
    });

    it('reconoce las copias de cierre (shutdown) con timestamp', () => {
      expect(isShutdownBackupFileName('traccion-shutdown-backup-2026-06-23T10-00-00-000Z.sqlite')).toBe(true);
    });

    it('no confunde una copia de cierre con una copia local rotada', () => {
      expect(isLocalBackupFileName('traccion-shutdown-backup-2026-06-23T10-00-00-000Z.sqlite')).toBe(false);
      expect(isShutdownBackupFileName('traccion-local-backup-2026-06-23T10-00-00-000Z.sqlite')).toBe(false);
    });

    it('rechaza nombres de archivo arbitrarios o ajenos al sistema de backups', () => {
      expect(isKnownBackupFileName('algo-random.sqlite')).toBe(false);
      expect(isKnownBackupFileName('traccion.sqlite')).toBe(false);
      expect(isKnownBackupFileName('')).toBe(false);
    });

    it('determina el tipo (sqlite/json) por la extensión', () => {
      expect(localBackupKindFromFileName('traccion-local-backup.sqlite')).toBe('sqlite');
      expect(localBackupKindFromFileName('traccion-local-backup.json')).toBe('json');
      expect(localBackupKindFromFileName('traccion-local-backup.txt')).toBeNull();
    });
  });

  describe('resolveLocalBackupReference — casos válidos', () => {
    it('resuelve un nombre simple de backup local a una ruta dentro del directorio local', () => {
      const result = resolveLocalBackupReference('traccion-local-backup.sqlite', localDir, shutdownDir);

      expect(result).toEqual({
        safeFileName: 'traccion-local-backup.sqlite',
        backupPath: '/data/sqlite-local-backup/traccion-local-backup.sqlite',
      });
    });

    it('resuelve una referencia con prefijo shutdown/ a una ruta dentro del directorio de cierre', () => {
      const result = resolveLocalBackupReference(
        'shutdown/traccion-shutdown-backup-2026-06-23T10-00-00-000Z.sqlite',
        localDir,
        shutdownDir,
      );

      expect(result).toEqual({
        safeFileName: 'traccion-shutdown-backup-2026-06-23T10-00-00-000Z.sqlite',
        backupPath: '/data/sqlite-local-backup/shutdown/traccion-shutdown-backup-2026-06-23T10-00-00-000Z.sqlite',
      });
    });

    it('normaliza separadores de Windows (\\\\) antes de comprobar el prefijo shutdown', () => {
      const result = resolveLocalBackupReference(
        'shutdown\\traccion-shutdown-backup-2026-06-23T10-00-00-000Z.json',
        localDir,
        shutdownDir,
      );

      expect(result?.safeFileName).toBe('traccion-shutdown-backup-2026-06-23T10-00-00-000Z.json');
    });
  });

  describe('resolveLocalBackupReference — seguridad (path traversal)', () => {
    it('rechaza un intento de escapar del directorio con ../', () => {
      const result = resolveLocalBackupReference(
        '../../../etc/passwd',
        localDir,
        shutdownDir,
      );

      expect(result).toBeNull();
    });

    it('rechaza un intento de escapar usando una ruta absoluta', () => {
      const result = resolveLocalBackupReference('/etc/passwd', localDir, shutdownDir);

      expect(result).toBeNull();
    });

    it('rechaza un intento de escapar disfrazado de referencia shutdown con ../ adicional', () => {
      const result = resolveLocalBackupReference(
        'shutdown/../../../etc/passwd',
        localDir,
        shutdownDir,
      );

      expect(result).toBeNull();
    });

    it('rechaza un nombre con separadores de directorio aunque el archivo final tenga nombre válido', () => {
      const result = resolveLocalBackupReference(
        'some/nested/path/traccion-local-backup.sqlite',
        localDir,
        shutdownDir,
      );

      expect(result).toBeNull();
    });

    it('rechaza un nombre de archivo que no es un backup conocido', () => {
      const result = resolveLocalBackupReference('traccion.sqlite', localDir, shutdownDir);

      expect(result).toBeNull();
    });

    it('rechaza un nombre de backup local válido si se le pone el prefijo shutdown/ (tipo equivocado)', () => {
      const result = resolveLocalBackupReference(
        'shutdown/traccion-local-backup.sqlite',
        localDir,
        shutdownDir,
      );

      expect(result).toBeNull();
    });

    it('rechaza string vacío', () => {
      expect(resolveLocalBackupReference('', localDir, shutdownDir)).toBeNull();
    });
  });
});
