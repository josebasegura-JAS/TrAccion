import { Database, RotateCcw } from 'lucide-react';
import { formatLockAge } from '../../services/databaseLockView';
import type { DatabaseStatusBadgeViewModel } from '../../services/databaseStatusView';
import { ActionButton } from '../ui/ActionButton';
import { FieldLabel, Select } from '../ui/Field';
import { Notice } from '../ui/Notice';
import { StatusBadge } from '../ui/StatusBadge';
import {
  databaseTone,
  formatBackupDate,
  formatBackupSize,
  formatBytesAsMb,
  noticeTone,
} from './ajustesCommon';

interface DatabaseSettingsSectionProps {
  databaseStatus: TraccionDatabaseStatus | null;
  databaseBadge: DatabaseStatusBadgeViewModel;
  databasePhaseLabel: string;
  databaseActionStatus: string;
  currentDatabaseLock: TraccionDatabaseLockInfo | null;
  isCheckingDatabaseLock: boolean;
  isForcingLockRelease: boolean;
  refreshCurrentDatabaseLock: () => Promise<void>;
  handleForceReleaseDatabaseLock: () => void | Promise<void>;
  handleSelectDatabaseDirectory: () => void | Promise<void>;
  handleResetDatabaseDirectory: () => void | Promise<void>;
  localBackups: TraccionLocalBackupEntry[];
  isLoadingBackups: boolean;
  isRestoringBackup: boolean;
  isCreatingManualBackup: boolean;
  refreshLocalBackups: () => Promise<void>;
  handleCreateManualBackup: () => void | Promise<void>;
  handleRestoreLocalBackup: (backup: TraccionLocalBackupEntry) => void | Promise<void>;
  secondaryBackupPath: string | null;
  secondaryBackupStatus: string;
  handleSetSecondaryBackupDirectory: () => void | Promise<void>;
  handleClearSecondaryBackupDirectory: () => void | Promise<void>;
  updatesDirectoryPath: string | null;
  updatesDirectoryStatus: string;
  updateCheckResult: TraccionAppUpdateCheckResult | null;
  isCheckingForUpdate: boolean;
  isApplyingUpdate: boolean;
  handleSetUpdatesDirectory: () => void | Promise<void>;
  handleClearUpdatesDirectory: () => void | Promise<void>;
  handleCheckForUpdateNow: () => void | Promise<void>;
  handleApplyUpdateNow: () => void | Promise<void>;
  dailyBackupSettings: TraccionDailyLocalBackupSettings | null;
  dailyBackupStatus: string;
  handleToggleDailyBackupEnabled: () => void | Promise<void>;
  handleChangeDailyBackupRetentionDays: (retentionDays: number) => void | Promise<void>;
  handleSetDailyBackupDirectory: () => void | Promise<void>;
  handleClearDailyBackupDirectory: () => void | Promise<void>;
  vacuumStatus: TraccionVacuumStatus | null;
  isVacuuming: boolean;
  vacuumActionStatus: string;
  handleVacuumNow: () => void | Promise<void>;
}

export function DatabaseSettingsSection({
  databaseStatus,
  databaseBadge,
  databasePhaseLabel,
  databaseActionStatus,
  currentDatabaseLock,
  isCheckingDatabaseLock,
  isForcingLockRelease,
  refreshCurrentDatabaseLock,
  handleForceReleaseDatabaseLock,
  handleSelectDatabaseDirectory,
  handleResetDatabaseDirectory,
  localBackups,
  isLoadingBackups,
  isRestoringBackup,
  isCreatingManualBackup,
  refreshLocalBackups,
  handleCreateManualBackup,
  handleRestoreLocalBackup,
  secondaryBackupPath,
  secondaryBackupStatus,
  handleSetSecondaryBackupDirectory,
  handleClearSecondaryBackupDirectory,
  updatesDirectoryPath,
  updatesDirectoryStatus,
  updateCheckResult,
  isCheckingForUpdate,
  isApplyingUpdate,
  handleSetUpdatesDirectory,
  handleClearUpdatesDirectory,
  handleCheckForUpdateNow,
  handleApplyUpdateNow,
  dailyBackupSettings,
  dailyBackupStatus,
  handleToggleDailyBackupEnabled,
  handleChangeDailyBackupRetentionDays,
  handleSetDailyBackupDirectory,
  handleClearDailyBackupDirectory,
  vacuumStatus,
  isVacuuming,
  vacuumActionStatus,
  handleVacuumNow,
}: DatabaseSettingsSectionProps) {
  return (
    <div
      id="base-de-datos"
      className="mb-4 scroll-mt-6 rounded-2xl border border-metro-border bg-metro-panel p-4"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-metro-text">Base de datos</h3>
          <p className="mt-1 text-sm text-metro-muted">
            SQLite es la base principal. La app mantiene una caché local y una copia de respaldo en
            este equipo. Selecciona una carpeta local o compartida; TrAccion usará dentro el fichero
            traccion.sqlite sin sobrescribir bases existentes.
          </p>
        </div>
        <StatusBadge
          icon={<Database size={14} aria-hidden="true" />}
          title={databaseBadge.title}
          tone={databaseTone(databaseBadge.tone)}
        >
          {databaseBadge.label}
        </StatusBadge>
      </div>

      <div className="grid gap-3 text-sm text-metro-text md:grid-cols-2">
        <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
            Ruta activa
          </p>
          <p className="mt-1 break-all font-medium">
            {databaseStatus?.path ?? 'SQLite no inicializado'}
          </p>
        </div>
        <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
            Estado
          </p>
          <p className="mt-1 font-medium">{databasePhaseLabel}</p>
          <p className="mt-1 text-xs text-metro-muted">{databaseBadge.detail}</p>
        </div>
      </div>

      {currentDatabaseLock && (
        <>
          <Notice className="mt-3" tone="warning">
            Bloqueo activo de {currentDatabaseLock.username}@{currentDatabaseLock.hostname} · PID{' '}
            {currentDatabaseLock.pid} · {formatLockAge(currentDatabaseLock.updatedAt)}
          </Notice>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-1.5 text-xs font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isCheckingDatabaseLock}
              onClick={() => void refreshCurrentDatabaseLock()}
              type="button"
            >
              {isCheckingDatabaseLock ? 'Comprobando...' : 'Comprobar de nuevo'}
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-1.5 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isForcingLockRelease}
              onClick={() => void handleForceReleaseDatabaseLock()}
              type="button"
            >
              {isForcingLockRelease ? 'Liberando...' : 'Forzar liberación'}
            </button>
          </div>
        </>
      )}

      {(databaseStatus?.message || databaseActionStatus) && (
        <Notice
          className="mt-3"
          tone={noticeTone(databaseActionStatus || databaseStatus?.message || '')}
        >
          {databaseActionStatus || databaseStatus?.message}
        </Notice>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
          onClick={() => void handleSelectDatabaseDirectory()}
          type="button"
        >
          <Database size={16} />
          Seleccionar ubicación
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
          onClick={() => void handleResetDatabaseDirectory()}
          type="button"
        >
          <RotateCcw size={16} />
          Restaurar ruta por defecto
        </button>
        <button
          className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isLoadingBackups}
          onClick={() => void refreshLocalBackups()}
          type="button"
        >
          <Database size={16} />
          Actualizar copias
        </button>
        <ActionButton
          variant="save"
          iconOnly={false}
          disabled={isCreatingManualBackup}
          onClick={() => void handleCreateManualBackup()}
          title="Crear una copia de respaldo ahora, sin esperar al guardado automático"
        >
          {isCreatingManualBackup ? 'Creando copia...' : 'Crear copia ahora'}
        </ActionButton>
      </div>

      <div className="mt-4 rounded-xl border border-metro-border bg-metro-surface p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
              Copias locales de respaldo
            </p>
            <p className="mt-1 text-xs text-metro-muted">
              Restaurar una copia crea antes un backup de la base activa y recarga TrAccion para
              aplicar los datos.
            </p>
            <p className="mt-1 text-xs text-metro-muted">
              Cada copia guarda tanto la base SQLite como un JSON de emergencia. El JSON solo debe
              usarse si la base SQLite no es recuperable; no sustituye al backup SQLite.
            </p>
          </div>
          <span className="text-xs font-semibold text-metro-muted">
            {isLoadingBackups ? 'Cargando…' : `${localBackups.length} copias`}
          </span>
        </div>

        {localBackups.length === 0 ? (
          <p className="text-xs text-metro-muted">No hay copias locales disponibles todavía.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-auto pr-1">
            {localBackups.map((backup) => (
              <div
                className="grid gap-2 rounded-lg border border-metro-border bg-metro-panel p-2 text-xs text-metro-text md:grid-cols-[minmax(0,1fr)_auto]"
                key={backup.id}
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{backup.fileName}</p>
                  <p className="mt-1 text-metro-muted">
                    {backup.kind.toUpperCase()} · {formatBackupSize(backup.sizeBytes)} ·{' '}
                    {formatBackupDate(backup.createdAt)}
                    {backup.isLiveCopy ? ' · copia viva' : ''}
                  </p>
                </div>
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isRestoringBackup}
                  onClick={() => void handleRestoreLocalBackup(backup)}
                  type="button"
                >
                  <RotateCcw size={14} />
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-metro-border bg-metro-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
          Carpeta de respaldo secundario
        </p>
        <p className="mt-1 text-xs text-metro-muted">
          TrAccion copiará los respaldos automáticos también a esta carpeta (red, USB u otro
          equipo). Protege frente a pérdida del equipo principal.
        </p>
        {secondaryBackupPath ? (
          <p className="mt-2 break-all text-xs font-medium text-metro-text">
            {secondaryBackupPath}
          </p>
        ) : (
          <p className="mt-2 text-xs text-metro-muted">Sin carpeta secundaria configurada.</p>
        )}
        {secondaryBackupStatus && (
          <p className="mt-1 text-xs text-metro-success">{secondaryBackupStatus}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-xs font-semibold text-white hover:bg-metro-dark"
            onClick={() => void handleSetSecondaryBackupDirectory()}
            type="button"
          >
            <Database size={14} />
            {secondaryBackupPath ? 'Cambiar carpeta' : 'Seleccionar carpeta'}
          </button>
          {secondaryBackupPath && (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red"
              onClick={() => void handleClearSecondaryBackupDirectory()}
              type="button"
            >
              <RotateCcw size={14} />
              Eliminar
            </button>
          )}
        </div>
      </div>

      <div
        className="mt-4 rounded-xl border border-metro-border bg-metro-surface p-3"
        id="actualizaciones"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
          Carpeta de actualizaciones
        </p>
        <p className="mt-1 text-xs text-metro-muted">
          Carpeta de red donde se publican las nuevas versiones de TrAccion (el .exe nuevo junto a
          version.txt). Al arrancar, TrAccion comprueba aquí si hay una versión más nueva y, si la
          hay, pregunta antes de actualizarse.
        </p>
        {updatesDirectoryPath ? (
          <p className="mt-2 break-all text-xs font-medium text-metro-text">
            {updatesDirectoryPath}
          </p>
        ) : (
          <p className="mt-2 text-xs text-metro-muted">
            Sin carpeta de actualizaciones configurada.
          </p>
        )}
        {updatesDirectoryStatus && (
          <p className="mt-1 text-xs text-metro-success">{updatesDirectoryStatus}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-xs font-semibold text-white hover:bg-metro-dark"
            onClick={() => void handleSetUpdatesDirectory()}
            type="button"
          >
            <Database size={14} />
            {updatesDirectoryPath ? 'Cambiar carpeta' : 'Seleccionar carpeta'}
          </button>
          {updatesDirectoryPath && (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red"
              onClick={() => void handleClearUpdatesDirectory()}
              type="button"
            >
              <RotateCcw size={14} />
              Eliminar
            </button>
          )}
          {updatesDirectoryPath && (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isCheckingForUpdate}
              onClick={() => void handleCheckForUpdateNow()}
              type="button"
            >
              <RotateCcw size={14} />
              {isCheckingForUpdate ? 'Comprobando…' : 'Comprobar ahora'}
            </button>
          )}
        </div>
        {updateCheckResult && (
          <div className="mt-3 rounded-lg border border-metro-border bg-metro-panel p-2 text-xs">
            {updateCheckResult.updateAvailable && updateCheckResult.latestVersion ? (
              <>
                <p className="font-semibold text-metro-text">
                  Hay una versión nueva disponible: V{updateCheckResult.latestVersion} (la tuya es V
                  {updateCheckResult.currentVersion}).
                </p>
                <button
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-xs font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={isApplyingUpdate}
                  onClick={() => void handleApplyUpdateNow()}
                  type="button"
                >
                  {isApplyingUpdate ? 'Actualizando…' : 'Actualizar ahora'}
                </button>
              </>
            ) : updateCheckResult.message ? (
              <p className="text-metro-muted">{updateCheckResult.message}</p>
            ) : (
              <p className="text-metro-muted">
                Ya tienes la última versión (V{updateCheckResult.currentVersion}).
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-metro-border bg-metro-surface p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
              Copia diaria local
            </p>
            <p className="mt-1 max-w-xl text-xs text-metro-muted">
              Mantiene en este equipo un archivo fijo por día de la semana (se sobrescribe cada
              vez), independiente de las copias en la carpeta de red. Útil si la carpeta compartida
              deja de estar disponible o se corrompe.
            </p>
          </div>
          <ActionButton
            variant={dailyBackupSettings?.enabled === false ? 'secondary' : 'save'}
            iconOnly={false}
            onClick={() => void handleToggleDailyBackupEnabled()}
          >
            {dailyBackupSettings?.enabled === false ? 'Desactivada' : 'Activada'}
          </ActionButton>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <FieldLabel className="w-32">
            Días a conservar
            <Select
              disabled={dailyBackupSettings?.enabled === false}
              onChange={(event) =>
                void handleChangeDailyBackupRetentionDays(Number(event.target.value))
              }
              value={dailyBackupSettings?.retentionDays ?? 7}
            >
              {[1, 2, 3, 4, 5, 6, 7].map((days) => (
                <option key={days} value={days}>
                  {days} día{days === 1 ? '' : 's'}
                </option>
              ))}
            </Select>
          </FieldLabel>
        </div>

        {dailyBackupSettings?.directoryPath ? (
          <p className="mt-3 break-all text-xs font-medium text-metro-text">
            {dailyBackupSettings.directoryPath}
          </p>
        ) : (
          <p className="mt-3 text-xs text-metro-muted">
            Usando la ubicación por defecto de la aplicación.
          </p>
        )}
        {dailyBackupStatus && (
          <p className="mt-1 text-xs text-metro-success">{dailyBackupStatus}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-xs font-semibold text-white hover:bg-metro-dark"
            onClick={() => void handleSetDailyBackupDirectory()}
            type="button"
          >
            <Database size={14} />
            {dailyBackupSettings?.directoryPath ? 'Cambiar carpeta' : 'Elegir otra carpeta'}
          </button>
          {dailyBackupSettings?.directoryPath && (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-semibold text-metro-text hover:border-metro-red"
              onClick={() => void handleClearDailyBackupDirectory()}
              type="button"
            >
              <RotateCcw size={14} />
              Restaurar por defecto
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-metro-border bg-metro-surface p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
              Compactar base de datos
            </p>
            <p className="mt-1 max-w-xl text-xs text-metro-muted">
              Libera en disco el espacio de filas ya borradas (p. ej. tras podar copias internas
              antiguas). Se ejecuta automáticamente como máximo una vez por semana al cerrar
              TrAccion. Puede tardar varios segundos y bloquea brevemente la escritura para el resto
              de equipos.
            </p>
          </div>
          <ActionButton
            variant="save"
            iconOnly={false}
            loading={isVacuuming}
            onClick={() => void handleVacuumNow()}
          >
            {isVacuuming ? 'Compactando...' : 'Compactar ahora'}
          </ActionButton>
        </div>

        <div className="mt-3 grid gap-2 text-xs text-metro-muted sm:grid-cols-2">
          <p>
            Tamaño actual:{' '}
            <span className="font-semibold text-metro-text">
              {vacuumStatus?.currentSizeBytes != null
                ? formatBytesAsMb(vacuumStatus.currentSizeBytes)
                : '—'}
            </span>
          </p>
          <p>
            Última compactación:{' '}
            <span className="font-semibold text-metro-text">
              {vacuumStatus?.lastVacuumAt
                ? new Date(vacuumStatus.lastVacuumAt).toLocaleString('es-ES')
                : 'Nunca'}
            </span>
          </p>
        </div>

        {vacuumStatus?.heaviestTables && vacuumStatus.heaviestTables.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-metro-muted">
              Tablas más pesadas
            </p>
            <div className="mt-2 overflow-hidden rounded-lg border border-metro-border">
              <table className="w-full text-xs">
                <thead className="bg-metro-panel text-metro-muted">
                  <tr>
                    <th className="px-2 py-1 text-left font-semibold">Tabla</th>
                    <th className="px-2 py-1 text-right font-semibold">Filas</th>
                    <th className="px-2 py-1 text-right font-semibold">Tamaño</th>
                  </tr>
                </thead>
                <tbody>
                  {vacuumStatus.heaviestTables.map((entry) => (
                    <tr className="border-t border-metro-border" key={entry.table}>
                      <td className="px-2 py-1 font-mono text-metro-text">{entry.table}</td>
                      <td className="px-2 py-1 text-right text-metro-text">
                        {entry.rowCount.toLocaleString('es-ES')}
                      </td>
                      <td className="px-2 py-1 text-right text-metro-text">
                        {entry.isExactSize ? formatBytesAsMb(entry.sizeBytes) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!vacuumStatus.heaviestTables[0]?.isExactSize && (
              <p className="mt-1 text-[11px] text-metro-muted">
                Tamaño no disponible en este equipo; ordenado por número de filas.
              </p>
            )}
          </div>
        )}

        {vacuumActionStatus && (
          <p className="mt-2 text-xs text-metro-success">{vacuumActionStatus}</p>
        )}
      </div>
    </div>
  );
}
