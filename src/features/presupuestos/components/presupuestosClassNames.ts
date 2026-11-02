/** Combina clases opcionales, sin modificar el orden ni la presentación. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
