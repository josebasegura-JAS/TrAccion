import { describe, expect, it } from 'vitest';
import { sanitizeRichText } from './richText';

describe('sanitizeRichText', () => {
  it('conserva las etiquetas permitidas sin tocarlas', () => {
    expect(sanitizeRichText('<p>Texto <strong>importante</strong> y <em>matizado</em></p>')).toBe(
      '<p>Texto <strong>importante</strong> y <em>matizado</em></p>',
    );
  });

  it('conserva listas con viñetas y numeradas', () => {
    expect(sanitizeRichText('<ul><li>Uno</li><li>Dos</li></ul>')).toBe('<ul><li>Uno</li><li>Dos</li></ul>');
    expect(sanitizeRichText('<ol><li>Uno</li><li>Dos</li></ol>')).toBe('<ol><li>Uno</li><li>Dos</li></ol>');
  });

  it('descarta etiquetas no permitidas pero conserva su texto (span con estilo de Word)', () => {
    expect(sanitizeRichText('<span style="font-family: Calibri; color: red;">Texto de Word</span>')).toBe(
      'Texto de Word',
    );
  });

  it('quita todos los atributos de las etiquetas permitidas (style, class, etc.)', () => {
    expect(sanitizeRichText('<p style="margin: 0" class="MsoNormal">Texto</p>')).toBe('<p>Texto</p>');
  });

  it('descarta tablas, imágenes y enlaces, conservando solo el texto', () => {
    expect(sanitizeRichText('<table><tr><td>Celda</td></tr></table>')).toBe('Celda');
    expect(sanitizeRichText('<img src="x.png" alt="algo" />texto')).toBe('texto');
    expect(sanitizeRichText('<a href="https://example.com">enlace</a>')).toBe('enlace');
  });

  it('no ejecuta ni conserva scripts', () => {
    expect(sanitizeRichText('<script>alert(1)</script>texto seguro')).toBe('texto seguro');
  });

  it('funciona con HTML anidado y desordenado típico de un pegado de Word', () => {
    const wordPaste =
      '<p class="MsoNormal"><span style="font-size:11pt"><b>Acuerdo:</b> se aprueba <i>por mayoría</i>.</span></p>';
    expect(sanitizeRichText(wordPaste)).toBe('<p><b>Acuerdo:</b> se aprueba <i>por mayoría</i>.</p>');
  });

  it('cadena vacía se queda vacía', () => {
    expect(sanitizeRichText('')).toBe('');
  });
});
