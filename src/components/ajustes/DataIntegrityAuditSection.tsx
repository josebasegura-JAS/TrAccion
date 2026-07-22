import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { ActionButton } from '../ui/ActionButton';
import { Notice } from '../ui/Notice';
import { StatusBadge } from '../ui/StatusBadge';
import { formatBackupDate, formatBytesAsMb } from './ajustesCommon';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../shared/table/CompactTable';

interface DataIntegrityAuditSectionProps {
  integrityReport: TraccionDataIntegrityReport | null;
  isRunningIntegrityAudit: boolean;
  integrityAuditStatus: string;
  handleRunIntegrityAudit: () => void | Promise<void>;
  handleExportIntegrityReport: () => void;
}

export function DataIntegrityAuditSection({
  integrityReport,
  isRunningIntegrityAudit,
  integrityAuditStatus,
  handleRunIntegrityAudit,
  handleExportIntegrityReport,
}: DataIntegrityAuditSectionProps) {
  return (
    <div
      id="diagnostico-integridad"
      className="mb-3 scroll-mt-6 rounded-xl bg-metro-panel p-3"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-metro-text">Diagnóstico de integridad</h3>
          <p className="mt-1 text-sm text-metro-muted">
            Comprueba el estado de la base de datos compartida sin modificar nada: solo detecta e
            informa. Útil para distinguir un problema real de datos de un problema meramente visual.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {integrityReport && (
            <ActionButton
              iconOnly={false}
              onClick={handleExportIntegrityReport}
              variant="secondary"
            >
              Exportar informe
            </ActionButton>
          )}
          <ActionButton
            iconOnly={false}
            variant="save"
            loading={isRunningIntegrityAudit}
            onClick={() => void handleRunIntegrityAudit()}
          >
            {isRunningIntegrityAudit ? 'Diagnosticando...' : 'Ejecutar diagnóstico ahora'}
          </ActionButton>
        </div>
      </div>

      {integrityAuditStatus && <Notice tone="error">{integrityAuditStatus}</Notice>}

      {integrityReport && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-metro-muted">
            Generado: {formatBackupDate(integrityReport.generatedAt)}
          </p>

          <div className="grid gap-3 text-sm text-metro-text md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
              <p className="text-xs font-semibold text-metro-muted">
                Integridad SQLite
              </p>
              <div className="mt-1.5">
                <StatusBadge
                  icon={
                    integrityReport.sqliteIntegrityCheck.ok ? (
                      <CheckCircle2 size={14} aria-hidden="true" />
                    ) : (
                      <AlertTriangle size={14} aria-hidden="true" />
                    )
                  }
                  tone={integrityReport.sqliteIntegrityCheck.ok ? 'success' : 'error'}
                >
                  {integrityReport.sqliteIntegrityCheck.ok ? 'Correcta' : 'Con problemas'}
                </StatusBadge>
              </div>
              {!integrityReport.sqliteIntegrityCheck.ok && (
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-metro-muted">
                  {integrityReport.sqliteIntegrityCheck.problems.map((problem, index) => (
                    <li key={index}>{problem}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
              <p className="text-xs font-semibold text-metro-muted">
                Esquema
              </p>
              <p className="mt-1 font-medium">
                Versión {integrityReport.schemaVersion.current}
                {!integrityReport.schemaVersion.upToDate &&
                  ` (esperado: ${integrityReport.schemaVersion.expected})`}
              </p>
              <div className="mt-1.5">
                <StatusBadge tone={integrityReport.schemaVersion.upToDate ? 'success' : 'warning'}>
                  {integrityReport.schemaVersion.upToDate ? 'Al día' : 'Migración pendiente'}
                </StatusBadge>
              </div>
            </div>

            <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
              <p className="text-xs font-semibold text-metro-muted">
                Tamaño de base de datos
              </p>
              <p className="mt-1 font-medium">
                {integrityReport.databaseSizeBytes != null
                  ? formatBytesAsMb(integrityReport.databaseSizeBytes)
                  : '—'}
              </p>
            </div>

            <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
              <p className="text-xs font-semibold text-metro-muted">
                Copias de seguridad
              </p>
              <p className="mt-1 font-medium">{integrityReport.backupCount} disponibles</p>
              <p className="mt-1 text-xs text-metro-muted">
                Última:{' '}
                {integrityReport.mostRecentBackup
                  ? formatBackupDate(integrityReport.mostRecentBackup.createdAt)
                  : 'Ninguna'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
            <p className="text-xs font-semibold text-metro-muted">
              Bloqueos caducados sin liberar
            </p>
            {integrityReport.expiredLocks.length === 0 ? (
              <p className="mt-1.5 text-sm text-metro-text">
                Ninguno. Todos los bloqueos activos están dentro de su tiempo de vida.
              </p>
            ) : (
              <div className="mt-2 overflow-hidden rounded-lg border border-metro-border">
                <CompactTable>
                  <CompactTableHead>
                    <tr>
                      <th className="px-2 py-1 text-left font-semibold">Módulo</th>
                      <th className="px-2 py-1 text-left font-semibold">Registro</th>
                      <th className="px-2 py-1 text-left font-semibold">Propietario</th>
                      <th className="px-2 py-1 text-left font-semibold">Caducó</th>
                    </tr>
                  </CompactTableHead>
                  <CompactTableBody>
                    {integrityReport.expiredLocks.map((lock) => (
                      <tr
                        className="border-t border-metro-border"
                        key={`${lock.module}-${lock.recordId}`}
                      >
                        <td className="px-2 py-1 font-mono text-metro-text">{lock.module}</td>
                        <td className="px-2 py-1 font-mono text-metro-text">{lock.recordId}</td>
                        <td className="px-2 py-1 text-metro-text">
                          {lock.ownerName}@{lock.machineName}
                        </td>
                        <td className="px-2 py-1 text-metro-text">
                          {formatBackupDate(lock.expiresAt)}
                        </td>
                      </tr>
                    ))}
                  </CompactTableBody>
                </CompactTable>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-metro-border bg-metro-surface p-3">
            <p className="text-xs font-semibold text-metro-muted">
              Comprobaciones de referencias
            </p>
            <div className="mt-2 space-y-2">
              {integrityReport.orphanChecks.map((check) => (
                <div
                  className="flex flex-col gap-1 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  key={check.label}
                >
                  <p className="text-sm text-metro-text">{check.label}</p>
                  <StatusBadge tone={check.count === 0 ? 'success' : 'warning'}>
                    {check.count === 0 ? 'Sin incidencias' : `${check.count} encontrados`}
                  </StatusBadge>
                  {check.count > 0 && (
                    <p className="text-xs text-metro-muted sm:basis-full">
                      Ejemplos: {check.sampleIds.join(', ')}
                      {check.count > check.sampleIds.length ? '…' : ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!integrityReport && !integrityAuditStatus && (
        <p className="mt-1 flex items-center gap-2 text-sm text-metro-muted">
          <ShieldCheck size={16} aria-hidden="true" />
          Aún no se ha ejecutado ningún diagnóstico en esta sesión.
        </p>
      )}
    </div>
  );
}
