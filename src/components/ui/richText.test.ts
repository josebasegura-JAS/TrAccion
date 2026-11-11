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


describe('sanitizeRichText — HTML activo o malicioso', () => {
  it('elimina manejadores inline, URLs activas e imágenes conservando el texto seguro', () => {
    const html = '<p onclick="alert(1)">Acta <strong onmouseover="alert(1)">aprobada</strong></p>' +
      '<img src="x" onerror="alert(1)"><a href="javascript:alert(1)">consulta</a>';
    expect(sanitizeRichText(html)).toBe('<p>Acta <strong>aprobada</strong></p>consulta');
  });

  it('elimina completamente iframe, SVG, MathML, scripts y su contenido', () => {
    const html = '<p>Antes</p><iframe src="https://example.invalid">secreto</iframe>' +
      '<svg onload="alert(1)"><text>oculto</text></svg>' +
      '<math><mi>invisible</mi></math><script>alert(1)</script><p>Después</p>';
    expect(sanitizeRichText(html)).toBe('<p>Antes</p><p>Después</p>');
  });

  it('mantiene la estructura de Word sin estilos, atributos ni etiquetas activas', () => {
    const html = '<div class="MsoNormal"><p style="color:red">Punto <b>uno</b></p>' +
      '<ol><li>Acuerdo</li></ol></div>';
    expect(sanitizeRichText(html)).toBe('<div><p>Punto <b>uno</b></p><ol><li>Acuerdo</li></ol></div>');
  });
});
