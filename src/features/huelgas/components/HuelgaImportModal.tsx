import { FileSpreadsheet } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import type { Employee } from '../../plantilla/domain/employee';
import type { HuelgaPersonalTurno } from './huelgasPersonalImport';
import type { HuelgaPersonalPlantillaStats } from './huelgasPersonalPlantilla';
import { formatDate, type Huelga } from './huelgasPageModel';

type Props = {
  importTarget: Huelga | null;
  importFileName: string;
  importPreview: HuelgaPersonalTurno[];
  importSkippedRows: number;
  importPlantillaStats: HuelgaPersonalPlantillaStats | null;
  importError: string;
  importing: boolean;
  employeesLoading: boolean;
  employees: Employee[];
  onClose: () => void;
  onSelectFile: (file: File | null) => void;
  onSave: () => void;
};

export function HuelgaImportModal({
  importTarget,
  importFileName,
  importPreview,
  importSkippedRows,
  importPlantillaStats,
  importError,
  importing,
  employeesLoading,
  employees,
  onClose: closeImport,
  onSelectFile: selectImportFile,
  onSave: saveImportedPersonal,
}: Props) {
  return (
    <>
      {importTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation">
          <section className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-metro-border bg-metro-app shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="huelga-import-title">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-metro-border bg-metro-app/95 px-5 py-4 backdrop-blur">
              <div>
                <h2 id="huelga-import-title" className="text-lg font-semibold text-metro-text">Importar personal con turno</h2>
                <p className="mt-1 text-sm text-metro-muted">{formatDate(importTarget.fecha)} · Personal trabajador previsto para ese día de huelga.</p>
              </div>
              <button className="rounded-lg px-2 py-1 text-xl text-metro-muted hover:bg-metro-raised hover:text-metro-text" onClick={closeImport} type="button" aria-label="Cerrar">×</button>
            </div>

            <div className="space-y-4 p-5">
              <section className="rounded-xl border border-metro-border bg-metro-panel/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><FileSpreadsheet size={20} /></div>
                    <div>
                      <p className="text-sm font-semibold text-metro-text">Excel de personal por día</p>
                      <p className="mt-1 text-xs text-metro-muted">Columnas esperadas: Resi./Estac., Inicio, Salida, Entrada, Fin, Nombre y Apellidos, Puesto y Turno. La residencia se contrastará con la Plantilla de TrAcción.</p>
                    </div>
                  </div>
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-metro-border bg-metro-panel px-3.5 text-sm font-semibold text-metro-text transition hover:border-metro-red hover:bg-metro-raised">
                    <FileSpreadsheet size={16} /> Seleccionar Excel
                    <input className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={employeesLoading} onChange={(event) => void selectImportFile(event.target.files?.[0] ?? null)} />
                  </label>
                </div>
                {importFileName && <p className="mt-3 text-xs text-metro-muted">Archivo: <span className="font-medium text-metro-text">{importFileName}</span></p>}
                {employeesLoading && <p className="mt-3 text-xs text-amber-200">Cargando Plantilla para poder contrastar la residencia…</p>}
                {!employeesLoading && employees.length === 0 && (
                  <p className="mt-3 text-xs text-amber-200">No hay personas disponibles en Plantilla. Podrás importar, pero la residencia se tomará provisionalmente del Excel y quedará pendiente de contraste.</p>
                )}
              </section>

              {importError && <div className="rounded-xl border border-red-500/40 bg-red-950/25 px-4 py-3 text-sm text-red-200">{importError}</div>}

              {importPreview.length > 0 && (
                <>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Personas detectadas</p><strong className="mt-1 block text-xl text-metro-text">{importPreview.length}</strong></div>
                    <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Filas omitidas</p><strong className="mt-1 block text-xl text-metro-text">{importSkippedRows}</strong></div>
                    <div className="rounded-xl border border-metro-border bg-metro-panel/55 p-3"><p className="text-xs text-metro-muted">Actualmente importadas</p><strong className="mt-1 block text-xl text-metro-text">{importTarget.personalConTurno?.length ?? 0}</strong></div>
                  </div>

                  {importPlantillaStats && (
                    <section className="rounded-xl border border-metro-border bg-metro-panel/45 p-4">
                      <div className="mb-3">
                        <p className="text-sm font-semibold text-metro-text">Contraste con Plantilla</p>
                        <p className="mt-1 text-xs text-metro-muted">La residencia usada para asignar responsables será la de Plantilla cuando exista una coincidencia única.</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-5">
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2"><p className="text-[11px] text-emerald-200/80">Encontradas</p><strong className="text-lg text-emerald-200">{importPlantillaStats.encontrados}</strong></div>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"><p className="text-[11px] text-amber-200/80">No encontradas</p><strong className="text-lg text-amber-200">{importPlantillaStats.noEncontrados}</strong></div>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"><p className="text-[11px] text-amber-200/80">Ambiguas</p><strong className="text-lg text-amber-200">{importPlantillaStats.ambiguos}</strong></div>
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"><p className="text-[11px] text-amber-200/80">Sin residencia</p><strong className="text-lg text-amber-200">{importPlantillaStats.sinResidenciaPlantilla}</strong></div>
                        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2"><p className="text-[11px] text-sky-200/80">Residencia distinta</p><strong className="text-lg text-sky-200">{importPlantillaStats.residenciaDiscrepante}</strong></div>
                      </div>
                    </section>
                  )}

                  <div className="overflow-hidden rounded-xl border border-metro-border">
                    <div className="border-b border-metro-border bg-metro-raised/60 px-4 py-2.5"><p className="text-xs font-semibold uppercase tracking-wide text-metro-muted">Vista previa · primeras {Math.min(importPreview.length, 8)} personas</p></div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px] text-left text-xs">
                        <thead className="bg-metro-panel text-metro-muted"><tr><th className="px-3 py-2">Nombre y apellidos</th><th className="px-3 py-2">Residencia Plantilla</th><th className="px-3 py-2">Resi./Estac. Excel</th><th className="px-3 py-2">Contraste</th><th className="px-3 py-2">Horario</th><th className="px-3 py-2">Puesto</th><th className="px-3 py-2">Turno</th></tr></thead>
                        <tbody className="divide-y divide-metro-border">
                          {importPreview.slice(0, 8).map((persona) => (
                            <tr key={persona.id}>
                              <td className="px-3 py-2 font-medium text-metro-text">{persona.nombreApellidos}</td>
                              <td className="px-3 py-2 font-medium text-metro-text">{persona.residenciaPlantilla || persona.residenciaAsignacion || '—'}</td>
                              <td className="px-3 py-2 text-metro-muted">{persona.residenciaExcel || persona.residenciaEstacion || '—'}</td>
                              <td className="px-3 py-2">
                                {persona.plantillaMatch === 'matched' ? (
                                  <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${persona.residenciaDiscrepante ? 'border-sky-500/35 bg-sky-500/10 text-sky-200' : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'}`}>{persona.residenciaDiscrepante ? 'Coincide · residencia distinta' : 'Encontrada'}</span>
                                ) : persona.plantillaMatch === 'ambiguous' ? (
                                  <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">Ambigua</span>
                                ) : persona.plantillaMatch === 'no-residence' ? (
                                  <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">Sin residencia</span>
                                ) : (
                                  <span className="inline-flex rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-200">No encontrada</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-metro-muted">{persona.inicio || '—'}–{persona.fin || '—'}{persona.salida || persona.entrada ? ` · ${persona.salida || '—'} / ${persona.entrada || '—'}` : ''}</td>
                              <td className="px-3 py-2 text-metro-muted">{persona.puesto || '—'}</td>
                              <td className="px-3 py-2 text-metro-muted">{persona.turno || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-metro-border bg-metro-app/95 px-5 py-4 backdrop-blur">
              <ActionButton variant="secondary" iconOnly={false} onClick={closeImport}>Cancelar</ActionButton>
              <ActionButton variant="import" iconOnly={false} loading={importing} disabled={importPreview.length === 0} onClick={() => void saveImportedPersonal()}>
                Importar {importPreview.length > 0 ? `${importPreview.length} personas` : 'personal'}
              </ActionButton>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
