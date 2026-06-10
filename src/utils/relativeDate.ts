const relativeTimeFormatter = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });

export function relativeDate(isoDate: string): string {
  if (!isoDate) {
    return '';
  }

  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (Math.abs(days) < 1) {
    return 'hoy';
  }

  if (Math.abs(days) < 7) {
    return relativeTimeFormatter.format(days, 'day');
  }

  if (Math.abs(days) < 30) {
    return relativeTimeFormatter.format(Math.round(days / 7), 'week');
  }

  return relativeTimeFormatter.format(Math.round(days / 30), 'month');
}
