import { BookOpen, CheckCircle2, ChevronRight, HelpCircle, Route } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ModalCloseButton } from './ui/ModalCloseButton';

export type ModuleHelpSection = {
  title: string;
  body?: ReactNode;
  items?: string[];
  ordered?: boolean;
};

interface ModuleHelpButtonProps {
  title: string;
  subtitle?: string;
  sections: ModuleHelpSection[];
  ariaLabel?: string;
}

export function ModuleHelpButton({ title, subtitle, sections, ariaLabel }: ModuleHelpButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const flowSection = sections.find((section) => section.ordered && section.items && section.items.length > 0);
  const detailSections = flowSection ? sections.filter((section) => section !== flowSection) : sections;

  return (
    <>
      <button
        aria-label={ariaLabel ?? `Abrir ayuda de ${title}`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-blue-400/70 bg-blue-500/15 text-blue-200 shadow-sm transition hover:border-blue-300 hover:bg-blue-500/25 hover:text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-300"
        data-tip={`Ayuda de ${title}`}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <HelpCircle size={17} strokeWidth={2.4} />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-3">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-xl border border-metro-border/80 bg-metro-surface shadow-card">
            <div className="flex items-start justify-between gap-4 border-b border-metro-border/70 bg-metro-panel px-5 py-3.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-200">
                  <Route size={15} />
                  <span>Guía visual</span>
                </div>
                <h3 className="mt-0.5 text-lg font-bold text-metro-text">{title}</h3>
                {subtitle ? <p className="mt-1 text-sm text-metro-muted">{subtitle}</p> : null}
              </div>
              <ModalCloseButton label="Cerrar ayuda" onClick={() => setIsOpen(false)} />
            </div>

            <div className="max-h-[76vh] overflow-y-auto px-5 py-4 text-sm text-metro-text">
              {flowSection ? (
                <section className="mb-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
                      <Route size={16} />
                    </span>
                    <div>
                      <h4 className="font-semibold text-metro-text">{flowSection.title}</h4>
                      <p className="text-xs text-metro-muted">Sigue los pasos en este orden para completar el proceso.</p>
                    </div>
                  </div>

                  {flowSection.body ? <div className="mb-3 text-metro-muted">{flowSection.body}</div> : null}

                  <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                    {flowSection.items?.map((item, index) => {
                      const isLast = index === (flowSection.items?.length ?? 0) - 1;
                      return (
                        <div
                          className="relative flex min-h-[112px] gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3.5"
                          key={`${flowSection.title}-${index}`}
                        >
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white shadow-sm">
                            {index + 1}
                          </span>
                          <div className="min-w-0 pr-3">
                            <p className="leading-5 text-metro-text">{item}</p>
                            <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                              <CheckCircle2 size={14} />
                              <span>Paso {index + 1}</span>
                            </div>
                          </div>
                          {!isLast ? (
                            <ChevronRight
                              aria-hidden="true"
                              className="absolute right-2.5 top-1/2 hidden -translate-y-1/2 text-emerald-400/55 xl:block"
                              size={18}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              {detailSections.length > 0 ? (
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/15 text-blue-200">
                      <BookOpen size={16} />
                    </span>
                    <div>
                      <h4 className="font-semibold text-metro-text">
                        {flowSection ? 'Detalles, reglas y excepciones' : 'Guía del módulo'}
                      </h4>
                      <p className="text-xs text-metro-muted">
                        Consulta solo el bloque que necesites durante el trabajo.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    {detailSections.map((section) => (
                      <section
                        className="rounded-xl border border-metro-border/70 bg-metro-panel/45 p-3.5"
                        key={section.title}
                      >
                        <h5 className="font-semibold text-metro-text">{section.title}</h5>
                        {section.body ? <div className="mt-1.5 leading-5 text-metro-muted">{section.body}</div> : null}
                        {section.items && section.items.length > 0 ? (
                          section.ordered ? (
                            <ol className="mt-2.5 space-y-2 text-metro-muted">
                              {section.items.map((item, index) => (
                                <li className="flex gap-2.5" key={`${section.title}-${index}`}>
                                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[11px] font-semibold text-blue-200">
                                    {index + 1}
                                  </span>
                                  <span className="leading-5">{item}</span>
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <ul className="mt-2.5 space-y-2 text-metro-muted">
                              {section.items.map((item, index) => (
                                <li className="flex gap-2.5" key={`${section.title}-${index}`}>
                                  <CheckCircle2 className="mt-0.5 shrink-0 text-blue-300/80" size={15} />
                                  <span className="leading-5">{item}</span>
                                </li>
                              ))}
                            </ul>
                          )
                        ) : null}
                      </section>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-metro-border/70 bg-metro-panel px-5 py-2.5">
              <p className="hidden text-xs text-metro-muted sm:block">
                La ayuda se actualiza con el flujo y las reglas definidas en cada módulo.
              </p>
              <button
                className="ml-auto rounded-lg bg-metro-red px-4 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
