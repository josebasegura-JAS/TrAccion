/**
 * Etiquetas permitidas en el HTML resultante. Todo lo demás (spans con
 * estilos inline, clases, tablas, imágenes...) se descarta al pegar — sobre
 * todo pensado para cuando alguien pega texto copiado de Word, que arrastra
 * mucho ruido de formato que no queremos guardar ni reproducir luego en el
 * acta exportada.
 */
const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'DIV']);

/** Etiquetas cuyo contenido se descarta entero, no solo la etiqueta — no queremos que el texto de un <script> o un <style> se cuele como si fuera texto normal. */
const STRIP_ENTIRELY_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE', 'NOSCRIPT']);

/** Reduce un HTML arbitrario (p. ej. pegado desde Word) al pequeño subconjunto de etiquetas que soporta RichTextEditor. */
export function sanitizeRichText(html: string): string {
  // DOMParser crea un documento separado e inerte: los manejadores de eventos
  // del HTML pegado no se activan en el documento vivo antes de sanearlo.
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const container = parsed.body;

  // Recorrido plano sobre TODOS los descendientes (querySelectorAll('*') no
  // se ve afectado por las reubicaciones que hace el "unwrap" de abajo,
  // porque no borra nodos elemento, solo cambia de quién cuelgan — así que
  // funciona igual de bien con HTML anidado a cualquier profundidad,
  // a diferencia de un recorrido recursivo sobre una foto fija de hijos).
  for (const element of Array.from(container.querySelectorAll('*'))) {
    // SVG y MathML conservan tagName en minúsculas al parsearse como HTML.
    // Normalizar impide que sus nodos se desenvuelvan y filtren texto interno.
    const tagName = element.tagName.toUpperCase();
    if (STRIP_ENTIRELY_TAGS.has(tagName)) {
      element.parentNode?.removeChild(element);
      continue;
    }

    if (!ALLOWED_TAGS.has(tagName)) {
      const parent = element.parentNode;
      if (parent) {
        while (element.firstChild) {
          parent.insertBefore(element.firstChild, element);
        }
        parent.removeChild(element);
      }
      continue;
    }

    while (element.attributes.length > 0) {
      element.removeAttribute(element.attributes[0].name);
    }
  }

  return container.innerHTML;
}
