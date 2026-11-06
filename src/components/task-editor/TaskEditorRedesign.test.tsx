import { describe, expect, it } from 'vitest';
import type { Dispatch, SetStateAction } from 'react';
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

const setDraft = (() => undefined) as Dispatch<SetStateAction<TaskDraft>>;

describe('rediseño del editor de Tareas', () => {
  it('presenta título a ancho completo sin duplicar Responsable, Estado ni Prioridad', () => {
    const html = renderToStaticMarkup(
      <TaskGeneralFields
        draft={draft}
        setDraft={setDraft}
        task={null}
        phaseOptions={['tarea']}
        originOptions={['LAB']}
        creationDate="2026-07-28"
      />,
    );
    expect(html).toContain('Resumen');
    expect(html).toContain('Título');
    expect(html).not.toContain('>Responsable<');
    expect(html).not.toContain('>Estado<');
    expect(html).not.toContain('>Prioridad<');
  });

  it('ofrece Estado, Prioridad y Responsable como selectores en el panel lateral', () => {
    const html = renderToStaticMarkup(<TaskStatusPanel draft={draft} setDraft={setDraft} responsibleOptions={['jasegura', 'Otros']} responsibleSelectValue="jasegura" otherResponsibleValue="" />);
    expect(html).toContain('Estado de la tarea');
    expect(html).toContain('aria-label="Estado de la tarea"');
    expect(html).toContain('aria-label="Prioridad de la tarea"');
    expect(html).toContain('aria-label="Responsable de la tarea"');
    expect(html).toContain('30/11/2026');
    expect(html).toContain('jasegura');
  });

  it('mantiene la entrada manual para responsable Otros', () => {
    const html = renderToStaticMarkup(<TaskStatusPanel draft={{ ...draft, responsable: 'Otros: Responsable externo' }} setDraft={setDraft} responsibleOptions={['jasegura', 'Otros']} responsibleSelectValue="Otros" otherResponsibleValue="Responsable externo" />);
    expect(html).toContain('aria-label="Indica el responsable"');
    expect(html).toContain('Responsable externo');
  });
});
