import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabaseLockManager,
  DATABASE_HEARTBEAT_BLOCKED_MESSAGE,
  getLockInfoPath,
  getLockPath,
  readLock,
  releaseLock,
  type DatabaseLockManager,
} from './databaseLock';

describe('getLockPath / getLockInfoPath', () => {
  it('construye la ruta del directorio de lock y del fichero owner.json dentro de él', () => {
    const lockPath = getLockPath('/red/carpeta/traccion.sqlite');
    expect(lockPath).toBe('/red/carpeta/traccion.sqlite.lockdir');
    expect(getLockInfoPath(lockPath)).toBe(path.join(lockPath, 'owner.json'));
  });
});

describe('createDatabaseLockManager', () => {
  let tempDir: string;
  let databasePath: string;
  let manager: DatabaseLockManager;
  let ownerId: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'traccion-lock-test-'));
    databasePath = path.join(tempDir, 'traccion.sqlite');
    ownerId = 'owner-a';
    manager = createDatabaseLockManager({ getOwnerId: () => ownerId });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('createLockInfo', () => {
    it('usa el ownerId resuelto por el getter inyectado en el momento de la llamada', () => {
      const lock = manager.createLockInfo();
      expect(lock.ownerId).toBe('owner-a');

      ownerId = 'owner-b';
      const secondLock = manager.createLockInfo();
      expect(secondLock.ownerId).toBe('owner-b');
    });

    it('incluye pid, hostname y timestamps de creación/actualización iguales', () => {
      const lock = manager.createLockInfo();
      expect(lock.pid).toBe(process.pid);
      expect(typeof lock.hostname).toBe('string');
      expect(lock.createdAt).toBe(lock.updatedAt);
    });
  });

  describe('acquireLock / readLock / releaseLock', () => {
    it('adquiere un lock nuevo cuando no existe ninguno, y se puede releer del disco', async () => {
      const lock = await manager.acquireLock(databasePath);

      const lockPath = getLockPath(databasePath);
      const reread = await readLock(lockPath);
      expect(reread?.ownerId).toBe(lock.ownerId);
    });

    it('releaseLock borra el lock solo si el ownerId coincide con el que lo creó', async () => {
      const lock = await manager.acquireLock(databasePath);
      const lockPath = getLockPath(databasePath);

      // Un "otro" lock con ownerId distinto no debe poder liberar el que no es suyo.
      await releaseLock(lockPath, { ...lock, ownerId: 'otro-owner' });
      expect(await readLock(lockPath)).not.toBeNull();

      await releaseLock(lockPath, lock);
      expect(await readLock(lockPath)).toBeNull();
    });

    it('rechaza adquirir el lock si ya está cogido por otro proceso y no ha caducado', async () => {
      await manager.acquireLock(databasePath);

      const otherOwnerManager = createDatabaseLockManager({ getOwnerId: () => 'otro-owner' });
      await expect(otherOwnerManager.acquireLock(databasePath, 100)).rejects.toThrow(/ocupada temporalmente/);
    });

    it('permite adquirir el lock si el anterior ha caducado (más de LOCK_TTL_MS sin renovarse)', async () => {
      const lockPath = getLockPath(databasePath);
      await mkdir(lockPath, { recursive: true });
      const staleLock = {
        ownerId: 'owner-viejo',
        username: 'alguien',
        hostname: 'otro-pc',
        pid: 1234,
        createdAt: '2000-01-01T00:00:00.000Z',
        updatedAt: '2000-01-01T00:00:00.000Z',
      };
      await writeFile(getLockInfoPath(lockPath), JSON.stringify(staleLock), 'utf8');

      const lock = await manager.acquireLock(databasePath, 500);
      expect(lock.ownerId).toBe('owner-a');
    });
  });

  describe('withDatabaseOperationLock', () => {
    it('ejecuta la operación y libera el lock automáticamente al terminar', async () => {
      const result = await manager.withDatabaseOperationLock(databasePath, async () => 'hecho');
      expect(result).toBe('hecho');

      const lockPath = getLockPath(databasePath);
      expect(await readLock(lockPath)).toBeNull();
    });

    it('libera el lock incluso si la operación lanza una excepción', async () => {
      await expect(
        manager.withDatabaseOperationLock(databasePath, async () => {
          throw new Error('fallo intencional');
        }),
      ).rejects.toThrow('fallo intencional');

      const lockPath = getLockPath(databasePath);
      expect(await readLock(lockPath)).toBeNull();
    });
  });

  describe('heartbeat y bloqueo de escrituras', () => {
    it('isDatabaseWriteBlockedByHeartbeat empieza en false y assertDatabaseWritesAllowed no lanza', () => {
      expect(manager.isDatabaseWriteBlockedByHeartbeat()).toBe(false);
      expect(() => manager.assertDatabaseWritesAllowed()).not.toThrow();
    });

    it('bloquea las escrituras tras 5 fallos consecutivos de heartbeat, y notifica el cambio', async () => {
      const fastManager = createDatabaseLockManager({ getOwnerId: () => ownerId, heartbeatIntervalMs: 30 });
      const lock = await fastManager.acquireLock(databasePath);
      const lockPath = getLockPath(databasePath);
      // Borrar el lock de disco hace que cada intento de heartbeat falle
      // (heartbeatDatabaseLock relee el lock y comprueba el ownerId).
      await releaseLock(lockPath, lock);

      const notifications: Array<{ blocked: boolean }> = [];
      fastManager.setDatabaseConnectivityIssueNotifier((payload) => notifications.push(payload));

      const heartbeat = fastManager.startDatabaseLockHeartbeat(lockPath, lock);
      try {
        await vi.waitFor(
          () => {
            expect(fastManager.isDatabaseWriteBlockedByHeartbeat()).toBe(true);
          },
          { timeout: 3000, interval: 20 },
        );

        expect(() => fastManager.assertDatabaseWritesAllowed()).toThrow(DATABASE_HEARTBEAT_BLOCKED_MESSAGE);
        expect(notifications.some((n) => n.blocked)).toBe(true);
      } finally {
        clearInterval(heartbeat);
      }
    });

    it('recupera las escrituras y notifica cuando el heartbeat vuelve a funcionar', async () => {
      const fastManager = createDatabaseLockManager({ getOwnerId: () => ownerId, heartbeatIntervalMs: 30 });
      const lockPath = getLockPath(databasePath);
      const lock = await fastManager.acquireLock(databasePath);
      await releaseLock(lockPath, lock);

      const notifications: Array<{ blocked: boolean }> = [];
      fastManager.setDatabaseConnectivityIssueNotifier((payload) => notifications.push(payload));

      const heartbeat = fastManager.startDatabaseLockHeartbeat(lockPath, lock);
      try {
        await vi.waitFor(
          () => {
            expect(fastManager.isDatabaseWriteBlockedByHeartbeat()).toBe(true);
          },
          { timeout: 3000, interval: 20 },
        );

        // Restaurar el lock en disco hace que el siguiente heartbeat tenga
        // éxito. releaseLock borró también el directorio .lockdir entero,
        // así que hay que recrearlo antes de escribir el fichero.
        await mkdir(lockPath, { recursive: true });
        await writeFile(getLockInfoPath(lockPath), JSON.stringify(lock), 'utf8');

        await vi.waitFor(
          () => {
            expect(fastManager.isDatabaseWriteBlockedByHeartbeat()).toBe(false);
          },
          { timeout: 3000, interval: 20 },
        );
        expect(notifications.at(-1)?.blocked).toBe(false);
      } finally {
        clearInterval(heartbeat);
      }
    });

    it('dos instancias de createDatabaseLockManager tienen estado de heartbeat completamente independiente', () => {
      const managerA = createDatabaseLockManager({ getOwnerId: () => 'a' });
      const managerB = createDatabaseLockManager({ getOwnerId: () => 'b' });

      expect(managerA.isDatabaseWriteBlockedByHeartbeat()).toBe(false);
      expect(managerB.isDatabaseWriteBlockedByHeartbeat()).toBe(false);
    });
  });
});
