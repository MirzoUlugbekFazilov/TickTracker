/** Shared formatting helpers. All output is en-GB. */

const DATE_FULL = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const DATE_SHORT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const TIME_ONLY = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatDateFull(timestamp: number): string {
  return DATE_FULL.format(timestamp);
}

export function formatDateShort(timestamp: number): string {
  return DATE_SHORT.format(timestamp);
}

export function formatTime(timestamp: number): string {
  return TIME_ONLY.format(timestamp);
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-GB');
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

/** `2022-08-01T06:40:31` -> `2022-08-01`, for date inputs. */
export function toDateInputValue(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Relative age in whole days/months/years, phrased against a supplied reference
 * point rather than `Date.now()`. The dataset ends in 2024, so every age is
 * expressed relative to the newest record in the data and the UI says so —
 * "4 months before the end of the dataset" is true, "4 months ago" would not be.
 */
export function formatAgeFrom(timestamp: number, reference: number): string {
  const days = Math.round((reference - timestamp) / 86_400_000);
  if (days <= 0) return 'the most recent record';
  if (days === 1) return '1 day earlier';
  if (days < 31) return `${days} days earlier`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} ${months === 1 ? 'month' : 'months'} earlier`;
  const years = (days / 365.25).toFixed(1).replace(/\.0$/, '');
  return `${years} years earlier`;
}

/** Sentence-case a label that may arrive in any case. */
export function sentenceCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** `1234567` -> `1.2M`, for compact stat tiles. */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}
