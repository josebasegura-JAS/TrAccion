import { describe, expect, it } from 'vitest';
import { editorHtmlToMarkdown, markdownToEditorHtml } from './visualMarkdown';

describe('visualMarkdown (acuerdos de Coordinación)', () => {
  it('muestra negrita y cursiva sin marcadores', () => {
    expect(markdownToEditorHtml('Acuerdo **importante** y *pendiente*')).toContain('<strong>importante</strong>');
    expect(markdownToEditorHtml('Acuerdo **importante** y *pendiente*')).toContain('<em>pendiente</em>');
  });
  it('mantiene listas y texto al guardar', () => {
    const source = '- Primero\n- Segundo\nFin';
    expect(editorHtmlToMarkdown(markdownToEditorHtml(source))).toBe(source);
  });
  it('conserva formato en la persistencia Markdown', () => {
    const source = 'Texto **negrita** y *cursiva*';
    expect(editorHtmlToMarkdown(markdownToEditorHtml(source))).toBe(source);
  });
  it('escapa texto que podría interpretarse como HTML', () => {
    expect(markdownToEditorHtml('<img src=x onerror=alert(1)>')).not.toContain('<img');
  });
});
