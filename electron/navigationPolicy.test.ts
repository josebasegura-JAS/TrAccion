import { describe, expect, it } from 'vitest';
import { isAllowedAppNavigation } from './navigationPolicy.js';

describe('navegación de la ventana principal', () => {
  const packaged = 'file:///C:/Program%20Files/TrAccion/resources/app.asar/dist/index.html';
  const dev = 'http://localhost:5173/';

  it('permite anclas de la SPA y la URL de origen exacta', () => {
    expect(isAllowedAppNavigation(packaged + '#/tareas', packaged)).toBe(true);
    expect(isAllowedAppNavigation(dev + '#/ajustes', dev)).toBe(true);
  });

  it('rechaza otros archivos locales y protocolos ajenos', () => {
    expect(isAllowedAppNavigation('file:///C:/Windows/System32/drivers/etc/hosts', packaged)).toBe(false);
    expect(isAllowedAppNavigation('https://example.com', packaged)).toBe(false);
    expect(isAllowedAppNavigation('javascript:alert(1)', packaged)).toBe(false);
  });

  it('rechaza URLs de desarrollo con prefijo parecido, distinto puerto o distinta ruta', () => {
    expect(isAllowedAppNavigation('http://localhost:5173.evil.test/', dev)).toBe(false);
    expect(isAllowedAppNavigation('http://localhost:5174/', dev)).toBe(false);
    expect(isAllowedAppNavigation('http://localhost:5173/otra-pagina', dev)).toBe(false);
  });

  it('falla de forma segura con URLs inválidas', () => {
    expect(isAllowedAppNavigation('no-es-una-url', packaged)).toBe(false);
  });
});
