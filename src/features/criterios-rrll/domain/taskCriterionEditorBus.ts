import type { CriterioRrllDraft } from './criterioRrll';

export type TaskCriterionEditorRequest =
  | {
      mode: 'create';
      taskId: string;
      taskTitle: string;
      draft: CriterioRrllDraft;
    }
  | {
      mode: 'edit';
      taskId: string;
      taskTitle: string;
      criterioId: string;
    };

const TASK_CRITERION_EDITOR_EVENT = 'traccion:task-criterion-editor';

export function requestTaskCriterionEditor(request: TaskCriterionEditorRequest): void {
  window.dispatchEvent(
    new CustomEvent<TaskCriterionEditorRequest>(TASK_CRITERION_EDITOR_EVENT, {
      detail: request,
    }),
  );
}

export function subscribeTaskCriterionEditor(
  listener: (request: TaskCriterionEditorRequest) => void,
): () => void {
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<TaskCriterionEditorRequest>;
    if (!customEvent.detail) return;
    listener(customEvent.detail);
  };

  window.addEventListener(TASK_CRITERION_EDITOR_EVENT, handler);
  return () => window.removeEventListener(TASK_CRITERION_EDITOR_EVENT, handler);
}
