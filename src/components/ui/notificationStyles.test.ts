import { describe, expect, it } from 'vitest';
import { notificationLayout, notificationToneStyles, type NotificationTone } from './notificationStyles';

describe('contrato visual de notificaciones', () => {
  const tones: NotificationTone[] = ['success', 'info', 'warning', 'error'];

  it.each(tones)('ofrece superficie e icono diferenciados para %s', (tone) => {
    expect(notificationToneStyles[tone].toast).toContain('border-');
    expect(notificationToneStyles[tone].toast).toContain('bg-');
    expect(notificationToneStyles[tone].icon).toContain('ring-');
  });

  it('mantiene las pautas de legibilidad y cierre accesible', () => {
    expect(notificationLayout.message).toContain('whitespace-pre-wrap');
    expect(notificationLayout.dismiss).toContain('focus:ring-2');
    expect(notificationLayout.dialogMessage).toContain('whitespace-pre-wrap');
  });
});
