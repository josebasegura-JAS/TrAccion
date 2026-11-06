import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { TaskDraft } from '../../features/tareas/domain/task';
import { TaskGeneralFields } from './TaskGeneralFields';
import { TaskStatusPanel } from './TaskStatusPanel';

const draft = {
  titulo: 'Acceso remoto sindicatos',
  tipo: 'sindical',
  fase: 'tarea',
  responsable: 'jasegura',
  estado: 'En Espera',
  prioridad: 'media',
  fechaLimite: '2026-11-30',
  sindicato: 'LAB',
  origen: '',
} as TaskDraft;

const setDraft = (() => undefined) as React.Dispatch<React.SetStateAction<TaskDraft>>;

describe('rediseño del editor de Tareas', () => {
  it('presenta título y responsable en el resumen sin duplicar Estado ni Prioridad', () => {
    const html = renderToStaticMarkup(
      <TaskGeneralFields
        draft={draft}
        setDraft={setDraft}
        task={null}
        phaseOptions={['tarea']}
        originOptions={['LAB']}
        responsibleOptions={['jasegura']}
        responsibleSelectValue="jasegura"
        otherResponsibleValue=""
        creationDate="2026-07-28"
      />,
    );
    expect(html).toContain('Resumen');
    expect(html).toContain('Título');
    expect(html).toContain('Responsable');
    expect(html).not.toContain('>Estado<');
    expect(html).not.toContain('>Prioridad<');
  });

  it('ofrece Estado y Prioridad como selectores en el panel lateral', () => {
    const html = renderToStaticMarkup(<TaskStatusPanel draft={draft} setDraft={setDraft} />);
    expect(html).toContain('Estado de la tarea');
    expect(html).toContain('aria-label="Estado de la tarea"');
    expect(html).toContain('aria-label="Prioridad de la tarea"');
    expect(html).toContain('30/11/2026');
    expect(html).toContain('jasegura');
  });
});
