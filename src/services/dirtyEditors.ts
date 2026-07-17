const dirtyEditorIds = new Set<string>();

export function setEditorDirty(editorId: string, isDirty: boolean): void {
  if (isDirty) dirtyEditorIds.add(editorId);
  else dirtyEditorIds.delete(editorId);
}

export function unregisterDirtyEditor(editorId: string): void {
  dirtyEditorIds.delete(editorId);
}

export function getDirtyEditorCount(): number {
  return dirtyEditorIds.size;
}

export function hasDirtyEditors(): boolean {
  return dirtyEditorIds.size > 0;
}
