import { useState } from 'react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { Input, Select } from '../../../components/ui/Field';
import { ModalCloseButton } from '../../../components/ui/ModalCloseButton';
import { ModalShell } from '../../../components/ui/ModalShell';
import { Notice } from '../../../components/ui/Notice';
import type { ActaType } from '../domain/acta';
import { CENSO_GRUPOS, EMPTY_CENSO_MIEMBRO_DRAFT, groupCensoMiembrosByGrupo, type CensoMiembroDraft } from '../domain/censo';
import { useActasContenidoStore } from '../store/useActasContenidoStore';

export function CensoManagerModal({ actaTypes, onClose }: { actaTypes: ActaType[]; onClose: () => void }) {
  const censo = useActasContenidoStore((state) => state.censo);
  const addCensoMiembro = useActasContenidoStore((state) => state.addCensoMiembro);
  const updateCensoMiembro = useActasContenidoStore((state) => state.updateCensoMiembro);
  const toggleCensoMiembroDisabled = useActasContenidoStore((state) => state.toggleCensoMiembroDisabled);

  const [tipoActa, setTipoActa] = useState<ActaType>(actaTypes[0] ?? 'Comité');
  const [draft, setDraft] = useState<CensoMiembroDraft>({ ...EMPTY_CENSO_MIEMBRO_DRAFT, tipoActa });
  const [error, setError] = useState('');

  const censoDelTipo = censo.filter((miembro) => miembro.tipoActa === tipoActa && !miembro.deletedAt);
  const grouped = groupCensoMiembrosByGrupo(censoDelTipo);

  async function handleAdd() {
    const result = await addCensoMiembro({ ...draft, tipoActa });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError('');
    setDraft({ ...EMPTY_CENSO_MIEMBRO_DRAFT, tipoActa });
  }

  return (
    <ModalShell labelledBy="censo-manager-titulo" maxWidthClassName="max-w-2xl" onClose={onClose} stacked>
      <div className="flex items-center justify-between border-b border-metro-border px-4 py-3">
        <div>
          <h3 className="text-lg font-bold text-metro-text" id="censo-manager-titulo">
            Censo de miembros
          </h3>
          <p className="text-xs text-metro-muted">Quién representa a cada parte, por tipo de acta.</p>
        </div>
        <ModalCloseButton onClick={onClose} />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <label className="block text-xs font-semibold text-metro-muted">
          Tipo de acta
          <Select
            onChange={(event) => {
              const nextTipo = event.target.value;
              setTipoActa(nextTipo);
              setDraft((current) => ({ ...current, tipoActa: nextTipo }));
            }}
            value={tipoActa}
          >
            {actaTypes.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo}
              </option>
            ))}
          </Select>
        </label>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="grid grid-cols-[1fr_180px_140px_auto] items-end gap-2 rounded-xl border border-metro-border bg-metro-panel/40 p-3">
          <label className="text-xs font-semibold text-metro-muted">
            Nombre
            <Input
              onChange={(event) => setDraft((current) => ({ ...current, nombre: event.target.value }))}
              value={draft.nombre}
            />
          </label>
          <label className="text-xs font-semibold text-metro-muted">
            Grupo
            <Select
              onChange={(event) =>
                setDraft((current) => ({ ...current, grupo: event.target.value as (typeof CENSO_GRUPOS)[number] }))
              }
              value={draft.grupo}
            >
              {CENSO_GRUPOS.map((grupo) => (
                <option key={grupo} value={grupo}>
                  {grupo}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-xs font-semibold text-metro-muted">
            Sigla (ELA, CIM...)
            <Input
              onChange={(event) => setDraft((current) => ({ ...current, organizacion: event.target.value }))}
              value={draft.organizacion}
            />
          </label>
          <ActionButton onClick={() => void handleAdd()} size="sm" title="Añadir al censo" variant="add">
            Añadir
          </ActionButton>
        </div>

        {CENSO_GRUPOS.map((grupo) =>
          grouped[grupo].length === 0 ? null : (
            <div className="space-y-1.5" key={grupo}>
              <p className="text-xs font-semibold uppercase tracking-wide text-metro-muted">{grupo}</p>
              {grouped[grupo].map((miembro) => (
                <div
                  className={`flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-2 py-1.5 ${
                    miembro.disabled ? 'opacity-50' : ''
                  }`}
                  key={miembro.id}
                >
                  <Input
                    className="flex-1"
                    onChange={(event) =>
                      void updateCensoMiembro(miembro.id, {
                        tipoActa: miembro.tipoActa,
                        grupo: miembro.grupo,
                        nombre: event.target.value,
                        organizacion: miembro.organizacion,
                      })
                    }
                    value={miembro.nombre}
                  />
                  <Input
                    className="w-28"
                    onChange={(event) =>
                      void updateCensoMiembro(miembro.id, {
                        tipoActa: miembro.tipoActa,
                        grupo: miembro.grupo,
                        nombre: miembro.nombre,
                        organizacion: event.target.value,
                      })
                    }
                    value={miembro.organizacion}
                  />
                  <ActionButton
                    onClick={() => void toggleCensoMiembroDisabled(miembro.id)}
                    size="sm"
                    title={miembro.disabled ? 'Reactivar' : 'Dar de baja'}
                    variant="secondary"
                  >
                    {miembro.disabled ? 'Reactivar' : 'Dar de baja'}
                  </ActionButton>
                </div>
              ))}
            </div>
          ),
        )}
      </div>
    </ModalShell>
  );
}
