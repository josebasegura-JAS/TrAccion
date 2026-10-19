import { describe, expect, it } from 'vitest';
import { buildUpdateProgressWindowScript } from './updateProgressWindow.js';

describe('ventana de progreso de actualizacion', () => {
  it('incluye todas las fases y espera confirmacion explicita del arranque', () => {
    const script = buildUpdateProgressWindowScript();
    expect(script).toContain('Actualizacion validada');
    expect(script).toContain('Cerrando aplicacion');
    expect(script).toContain('Instalando nueva version');
    expect(script).toContain('Arrancando TrAccion');
    expect(script).toContain('Aplicacion lista');
    expect(script).toContain("'ready'");
    expect(script).toContain("'error'");
    expect(script).toContain('ShowDialog()');
  });
});
