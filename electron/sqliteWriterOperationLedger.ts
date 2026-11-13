/**
 * PR9D-5A · Control de escrituras enviadas al futuro proceso propietario.
 * El estado 'unknown' nunca es reintentable de forma automática.
 * No transporta SQL ni datos, únicamente IDs de operación y generación.
 */
export type WriterOperationState = 'submitted' | 'acknowledged' | 'completed' | 'unknown';
export interface WriterOperationSnapshot {
  id: string;
  generation: number;
  state: WriterOperationState;
}
export function createSqliteWriterOperationLedger() {
  const operations = new Map<string, WriterOperationSnapshot>();

  function current(id: string, generation: number): WriterOperationSnapshot {
    const state = operations.get(id);
    if (!state || state.generation !== generation) {
      throw new Error('Escritura desconocida o de una generación anterior.');
    }
    return state;
  }

  return {
    begin(id: string, generation: number): void {
      if (!id || !Number.isSafeInteger(generation) || generation < 1 || operations.has(id)) {
        throw new Error('Identificador de escritura duplicado, inválido o ya registrado.');
      }
      operations.set(id, { id, generation, state: 'submitted' });
    },
    acknowledge(id: string, generation: number): void {
      const op = current(id, generation);
      if (op.state !== 'submitted') throw new Error('Confirmación fuera de orden.');
      operations.set(id, { ...op, state: 'acknowledged' });
    },
    complete(id: string, generation: number): void {
      const op = current(id, generation);
      if (op.state !== 'acknowledged') throw new Error('Resultado sin confirmación de recepción.');
      operations.set(id, { ...op, state: 'completed' });
    },
    /** Ante pérdida del proceso o conexión, todas las escrituras no
     * completadas requieren conciliación contra SQLite, no retransmisión. */
    markGenerationUncertain(generation: number): string[] {
      const affected: string[] = [];
      for (const [id, op] of operations) {
        if (op.generation !== generation || op.state === 'completed') continue;
        operations.set(id, { ...op, state: 'unknown' });
        affected.push(id);
      }
      return affected;
    },
    /** Conciliación explícita hecha por la capa de persistencia:
     * el libro NO asume commit ni decide reintentos. */
    reconcile(id: string, generation: number): void {
      const op = current(id, generation);
      if (op.state !== 'unknown') throw new Error('Solo se concilian resultados inciertos.');
      operations.delete(id);
    },
    hasUnknownOperations(): boolean {
      return [...operations.values()].some(op => op.state === 'unknown');
    },
    get(id: string): WriterOperationSnapshot | null {
      const state = operations.get(id);
      return state ? { ...state } : null;
    },
  };
}
