import { describe, expect, it } from 'vitest';
import {
  buildEspecialHtml,
  buildEspecialMailDraft,
  buildEspecialSubject,
  splitEspecialRecipients,
  visibleEspecialEvents,
  type EspecialEvent,
  type EspecialRecipient,
} from './especiales';

function buildRecipient(overrides: Partial<EspecialRecipient>): EspecialRecipient {
  return {
    id: 'recipient-base',
    nombre: 'Nombre Base',
    email: 'base@example.com',
    tipo: 'para',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function buildEvent(overrides: Partial<EspecialEvent>): EspecialEvent {
  return {
    id: 'event-base',
    evento: 'Athletic - Real Sociedad',
    fecha: '2026-01-10',
    hora: '20:00',
    enlace: 'https://example.com',
    ruta: 'Sala 1',
    observaciones: 'Refuerzo operativo',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('especiales domain', () => {
  it('genera el asunto con el formato exacto del servicio especial', () => {
    expect(buildEspecialSubject(' Athletic - Real Sociedad ')).toBe(
      'Servicio Especial Athletic - Real Sociedad',
    );
  });

  it('separa destinatarios Para y CC excluyendo borrados', () => {
    const recipients = [
      buildRecipient({ id: 'para-1', email: 'para@example.com', tipo: 'para' }),
      buildRecipient({ id: 'cc-1', email: 'cc@example.com', tipo: 'cc' }),
      buildRecipient({
        id: 'deleted',
        email: 'deleted@example.com',
        tipo: 'para',
        deletedAt: '2026-01-02T00:00:00.000Z',
      }),
    ];

    expect(splitEspecialRecipients(recipients)).toEqual({
      para: [recipients[0]],
      cc: [recipients[1]],
    });
  });

  it('genera HTML Verdana con los datos principales del evento', () => {
    const html = buildEspecialHtml({
      evento: 'Athletic - Real Sociedad',
      fecha: '2026-01-10',
      hora: '20:00',
      enlace: 'https://example.com',
      ruta: 'Sala 1',
      observaciones: 'Refuerzo operativo',
    });

    expect(html).toContain('font-family: Verdana');
    expect(html).toContain('<strong>Evento:</strong> Athletic - Real Sociedad');
    expect(html).toContain('<strong>Fecha:</strong> 2026-01-10');
    expect(html).toContain('<strong>Hora:</strong> 20:00');
    expect(html).toContain('<strong>Enlace:</strong> https://example.com');
    expect(html).toContain('<strong>Ruta:</strong> Sala 1');
    expect(html).toContain('<strong>Observaciones:</strong> Refuerzo operativo');
  });

  it('excluye registros deletedAt en listados y borradores', () => {
    const events = [
      buildEvent({ id: 'visible' }),
      buildEvent({ id: 'deleted', deletedAt: '2026-01-02T00:00:00.000Z' }),
    ];
    const recipients = [
      buildRecipient({ id: 'visible-para', email: 'visible@example.com', tipo: 'para' }),
      buildRecipient({
        id: 'deleted-cc',
        email: 'deleted@example.com',
        tipo: 'cc',
        deletedAt: '2026-01-02T00:00:00.000Z',
      }),
    ];

    expect(visibleEspecialEvents(events).map((event) => event.id)).toEqual(['visible']);
    expect(buildEspecialMailDraft(events[0], recipients)).toMatchObject({
      to: ['visible@example.com'],
      cc: [],
    });
  });
});
