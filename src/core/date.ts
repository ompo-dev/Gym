/** All dates are local calendar days as `YYYY-MM-DD`. */
import { locale, t } from '@/i18n';

function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return toISO(date);
}

export function dayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return t('date.today');
  if (iso === addDays(today, -1)) return t('date.yesterday');
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function timeLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(locale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function nearbyGapLabel(current: number, previous?: number): string | null {
  if (!previous) return null;
  const deltaSeconds = Math.round((current - previous) / 1000);
  if (deltaSeconds <= 0 || deltaSeconds > 300) return null;
  if (deltaSeconds < 60) return `+${deltaSeconds}s`;
  const minutes = Math.floor(deltaSeconds / 60);
  const seconds = deltaSeconds % 60;
  return seconds === 0 ? `+${minutes}m` : `+${minutes}m ${seconds}s`;
}
