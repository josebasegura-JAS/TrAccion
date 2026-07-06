import { describe, expect, it } from 'vitest';
import { parseDelimitedText } from './delimitedText';

describe('parseDelimitedText', () => {
  it('usa punto y coma cuando no hay más comas que puntos y coma en la cabecera', () => {
    const text = 'Empleado;Nombre;Observaciones\n1;Ana;Sin comentarios\n2;Bea;';
    expect(parseDelimitedText(text)).toEqual([
      ['Empleado', 'Nombre', 'Observaciones'],
      ['1', 'Ana', 'Sin comentarios'],
      ['2', 'Bea', ''],
    ]);
  });

  it('detecta la coma como delimitador cuando hay más comas que puntos y coma en la cabecera', () => {
    const text = 'Empleado,Nombre,Observaciones\n1,Ana,"Con, coma dentro"\n2,Bea,Normal';
    expect(parseDelimitedText(text)).toEqual([
      ['Empleado', 'Nombre', 'Observaciones'],
      ['1', 'Ana', 'Con, coma dentro'],
      ['2', 'Bea', 'Normal'],
    ]);
  });

  it('usa tabulador si el texto contiene tabuladores, aunque no se indique la extensión', () => {
    const text = 'Empleado\tNombre\n1\tAna';
    expect(parseDelimitedText(text)).toEqual([
      ['Empleado', 'Nombre'],
      ['1', 'Ana'],
    ]);
  });

  it('usa tabulador cuando la extensión es tsv aunque el contenido use punto y coma dentro de un campo', () => {
    const text = 'Empleado\tObservaciones\n1\tContiene; punto y coma';
    expect(parseDelimitedText(text, 'tsv')).toEqual([
      ['Empleado', 'Observaciones'],
      ['1', 'Contiene; punto y coma'],
    ]);
  });

  it('desescapa las comillas dobles duplicadas dentro de un campo entrecomillado', () => {
    const text = 'Empleado;Cita\n1;"Dijo ""hola"" a todos"';
    expect(parseDelimitedText(text)).toEqual([
      ['Empleado', 'Cita'],
      ['1', 'Dijo "hola" a todos'],
    ]);
  });

  it('ignora las líneas en blanco', () => {
    const text = 'Empleado;Nombre\n\n1;Ana\n   \n2;Bea';
    expect(parseDelimitedText(text)).toEqual([
      ['Empleado', 'Nombre'],
      ['1', 'Ana'],
      ['2', 'Bea'],
    ]);
  });
});
