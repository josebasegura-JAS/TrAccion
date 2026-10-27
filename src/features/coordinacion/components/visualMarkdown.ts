/** Subconjunto Markdown empleado en los acuerdos; se conserva el formato persistido. */
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function markdownToEditorHtml(value: string): string {
  const inline = (s: string) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const close = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  for (const line of lines) {
    const bullet = /^\s*[-*] (.*)$/.exec(line);
    const numbered = /^\s*\d+\. (.*)$/.exec(line);
    const wanted = bullet ? 'ul' : numbered ? 'ol' : null;
    if (wanted !== list) { close(); if (wanted) { out.push('<' + wanted + '>'); list = wanted; } }
    if (wanted) out.push('<li>' + inline((bullet ?? numbered)![1]) + '</li>');
    else out.push('<div>' + (line ? inline(line) : '<br>') + '</div>');
  }
  close();
  return out.join('');
}
export function editorHtmlToMarkdown(html: string): string {
  const root = document.createElement('div');
  root.innerHTML = html;
  const text = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    const body = Array.from(node.childNodes).map(text).join('');
    switch (node.tagName) {
      case 'STRONG': case 'B': return '**' + body + '**';
      case 'EM': case 'I': return '*' + body + '*';
      case 'BR': return '\n';
      case 'UL': return Array.from(node.children).map(li => '- ' + text(li).replace(/\n+$/g, '')).join('\n') + '\n';
      case 'OL': return Array.from(node.children).map((li, i) => (i + 1) + '. ' + text(li).replace(/\n+$/g, '')).join('\n') + '\n';
      case 'LI': return body;
      case 'DIV': case 'P': return body + '\n';
      default: return body;
    }
  };
  return Array.from(root.childNodes).map(text).join('').replace(/\n+$/, '');
}
