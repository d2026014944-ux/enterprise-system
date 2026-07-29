/**
 * Date Utilities
 *
 * Date helpers using date-fns for timezone-safe operations.
 * All dates are normalized to UTC internally.
 *
 * Design Rule: Never use native Date arithmetic.
 * Always use these helpers to avoid timezone pitfalls.
 */

import {
  format as fnsFormat,
  parseISO,
  isValid,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInSeconds,
  addDays,
  addHours,
  addMinutes,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isBefore,
  isAfter,
  isSameDay,
  isSameMonth,
  isSameYear,
  subDays,
  subHours,
  subMinutes,
} from 'date-fns';

// ─── UTC Normalization ────────────────────────────────────

/**
 * Normalize a date to UTC midnight.
 * Strips time components for date-only comparisons.
 */
export function toUtcDate(date: Date | string): Date {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) throw new Error(`Invalid date: ${date}`);
  return startOfDay(d);
}

/**
 * Convert a date to ISO 8601 string in UTC.
 */
export function toUtcString(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) throw new Error(`Invalid date: ${date}`);
  return d.toISOString();
}

// ─── Parsing ──────────────────────────────────────────────

/**
 * Parse an ISO 8601 string into a Date.
 * Returns null for invalid strings instead of throwing.
 */
export function parseDate(value: string): Date | null {
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

/**
 * Parse a date or throw with a descriptive message.
 */
export function parseDateOrThrow(value: string): Date {
  const d = parseDate(value);
  if (!d) throw new Error(`Invalid date format: "${value}". Expected ISO 8601.`);
  return d;
}

// ─── Formatting ───────────────────────────────────────────

type DateFormat = 'iso' | 'short' | 'long' | 'datetime' | 'time' | 'relative';

const FORMAT_MAP: Record<string, string> = {
  iso: "yyyy-MM-dd'T'HH:mm:ss'Z'",
  short: 'yyyy-MM-dd',
  long: 'MMMM d, yyyy',
  datetime: 'yyyy-MM-dd HH:mm:ss',
  time: 'HH:mm:ss',
};

/**
 * Format a date using a named preset or custom format string.
 */
export function formatDate(date: Date | string, format: DateFormat | string = 'iso'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) throw new Error(`Invalid date: ${date}`);

  const pattern = FORMAT_MAP[format] ?? format;
  return fnsFormat(d, pattern);
}

// ─── Duration Calculations ────────────────────────────────

export interface Duration {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  totalMinutes: number;
  totalHours: number;
  totalDays: number;
}

/**
 * Calculate the duration between two dates.
 */
export function durationBetween(start: Date | string, end: Date | string): Duration {
  const s = typeof start === 'string' ? parseISO(start) : start;
  const e = typeof end === 'string' ? parseISO(end) : end;

  if (!isValid(s) || !isValid(e)) {
    throw new Error('Invalid date(s) provided for duration calculation');
  }

  const totalSeconds = differenceInSeconds(e, s);
  const days = differenceInDays(e, s);
  const hours = differenceInHours(e, s) % 24;
  const minutes = differenceInMinutes(e, s) % 60;
  const seconds = totalSeconds % 60;

  return {
    days: Math.abs(days),
    hours: Math.abs(hours),
    minutes: Math.abs(minutes),
    seconds: Math.abs(seconds),
    totalSeconds: Math.abs(totalSeconds),
    totalMinutes: Math.abs(differenceInMinutes(e, s)),
    totalHours: Math.abs(differenceInHours(e, s)),
    totalDays: Math.abs(days),
  };
}

/**
 * Format a duration as a human-readable string.
 * Example: "2d 3h 15m" or "45s"
 */
export function formatDuration(duration: Duration): string {
  const parts: string[] = [];

  if (duration.days > 0) parts.push(`${duration.days}d`);
  if (duration.hours > 0) parts.push(`${duration.hours}h`);
  if (duration.minutes > 0) parts.push(`${duration.minutes}m`);
  if (parts.length === 0 || duration.seconds > 0) parts.push(`${duration.seconds}s`);

  return parts.join(' ');
}

// ─── Comparisons ──────────────────────────────────────────

/**
 * Check if a date is expired (before now).
 */
export function isExpired(date: Date | string): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isBefore(d, new Date());
}

/**
 * Check if a date is within a given number of days from now.
 */
export function isWithinDays(date: Date | string, days: number): boolean {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const now = new Date();
  return isAfter(d, subDays(now, days)) && isBefore(d, addDays(now, days));
}

/**
 * Get a relative time description (e.g., "2 hours ago", "in 3 days").
 */
export function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const now = new Date();
  const seconds = differenceInSeconds(now, d);

  if (Math.abs(seconds) < 60) return 'just now';

  const minutes = differenceInMinutes(now, d);
  if (Math.abs(minutes) < 60) {
    return minutes > 0 ? `${minutes}m ago` : `in ${Math.abs(minutes)}m`;
  }

  const hours = differenceInHours(now, d);
  if (Math.abs(hours) < 24) {
    return hours > 0 ? `${hours}h ago` : `in ${Math.abs(hours)}h`;
  }

  const days = differenceInDays(now, d);
  if (Math.abs(days) < 30) {
    return days > 0 ? `${days}d ago` : `in ${Math.abs(days)}d`;
  }

  return formatDate(d, 'short');
}

// ─── Date Arithmetic (Re-exports) ─────────────────────────

export { addDays, addHours, addMinutes, subDays, subHours, subMinutes };
export { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear };
export { isBefore, isAfter, isSameDay, isSameMonth, isSameYear, isValid };
