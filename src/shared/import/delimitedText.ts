/**
 * Parser de texto delimitado (CSV/TSV) compartido por los importadores de la app.
 * Delimitador: tabulador si la extensión es .tsv o el texto contiene tabuladores;
 * si no, se cuenta cuántas comas y puntos y coma hay en la primera línea y se usa
 * el que más aparezca (por defecto punto y coma en caso de empate).
 * Soporta comillas dobles como envoltorio de campo, incluida la comilla escapada `""`.
 */

export type TabularRow = string[];

export function parseDelimitedText(text: string, extension?: string): TabularRow[] {
  const delimiter = extension === 'tsv' || text.includes('\t') ? '\t' : getCsvDelimiter(text);
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => parseDelimitedLine(line, delimiter));
}

function getCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  return commaCount > semicolonCount ? ',' : ';';
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}
