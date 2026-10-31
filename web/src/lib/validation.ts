/**
 * Validation for the report form.
 *
 * THREE SEVERITIES, NOT TWO
 * -------------------------
 * The brief asks for "error, warning and success messages", and the distinction
 * is a real one rather than three colours of the same thing:
 *
 *   error   — the value cannot be accepted. Blocks submission.
 *   warning — the value is accepted but probably not what the user meant.
 *             Does NOT block submission. A sighting at 3am is unusual, not
 *             invalid, and refusing it would be the app overruling someone who
 *             was actually there.
 *   success — the field is filled and plausible. Shown sparingly, on the fields
 *             where confirmation is genuinely reassuring.
 *
 * Validation is pure: it takes values and returns messages. No DOM, no state,
 * which makes each rule independently testable and keeps the component free of
 * branching logic.
 */

import { findSpecies } from '../data/species';
import { CITY_NAMES } from '../data/cities';

export type FieldSeverity = 'error' | 'warning' | 'success';

export interface FieldMessage {
  severity: FieldSeverity;
  message: string;
}

export interface ReportFormValues {
  date: string;
  time: string;
  location: string;
  species: string;
  notes: string;
  imageAlt: string;
}

export type FieldName = keyof ReportFormValues;

export type ValidationResult = Partial<Record<FieldName, FieldMessage>>;

export const MAX_NOTES_LENGTH = 500;

/** Local `YYYY-MM-DD` for today, used as the max on the date input. */
export function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * The earliest date the form accepts. Ten years back: old enough for a genuine
 * recollection, recent enough that a typo like `0202-05-14` is caught.
 */
function earliestAcceptableDate(): Date {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 10);
  return date;
}

function validateDate(value: string): FieldMessage | undefined {
  if (!value) {
    return { severity: 'error', message: 'Enter the date you saw the tick.' };
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { severity: 'error', message: 'That is not a date we can read. Use the date picker.' };
  }

  // Compare against end-of-today so a sighting earlier today is not rejected.
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  if (parsed.getTime() > endOfToday.getTime()) {
    return {
      severity: 'error',
      message: 'The date is in the future. A sighting has to have already happened.',
    };
  }

  if (parsed.getTime() < earliestAcceptableDate().getTime()) {
    return {
      severity: 'error',
      message: 'That date is more than ten years ago. Please check the year.',
    };
  }

  // A warning, not an error: a sighting from last year is still useful data.
  const daysAgo = (Date.now() - parsed.getTime()) / 86_400_000;
  if (daysAgo > 365) {
    return {
      severity: 'warning',
      message:
        'This sighting is over a year old. It will still be recorded, but recent reports are the most useful for tracking current activity.',
    };
  }

  return { severity: 'success', message: 'Date looks good.' };
}

function validateTime(value: string): FieldMessage | undefined {
  if (!value) {
    return {
      severity: 'error',
      message: 'Enter roughly what time it was. An estimate is fine.',
    };
  }

  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return { severity: 'error', message: 'Use the 24-hour format HH:MM, for example 14:30.' };
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return { severity: 'error', message: 'That is not a valid time of day.' };
  }

  // Ticks quest by day; a 2am sighting is far more likely a typo than a fact.
  // Still only a warning — someone may well have found one on a dog at 2am.
  if (hours >= 0 && hours < 5) {
    return {
      severity: 'warning',
      message:
        'That is the middle of the night. Ticks are usually found during the day, so please double-check the time — we will accept it either way.',
    };
  }

  return undefined;
}

function validateLocation(value: string): FieldMessage | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return { severity: 'error', message: 'Choose the nearest city.' };
  }

  // A free-text location outside the known set still plots, at the geographic
  // centre of Great Britain, and the warning says so rather than hiding it.
  if (!CITY_NAMES.some((city) => city.toLowerCase() === trimmed.toLowerCase())) {
    return {
      severity: 'warning',
      message:
        'That location is not one of the 14 cities in the dataset, so we have no coordinates for it. Your report will be saved but will appear at the centre of the UK on the map.',
    };
  }

  return { severity: 'success', message: 'Location recognised.' };
}

function validateSpecies(value: string): FieldMessage | undefined {
  if (!value) {
    return {
      severity: 'error',
      message: 'Choose a species, or "Not sure" if you cannot tell.',
    };
  }

  if (value === UNKNOWN_SPECIES) {
    return {
      severity: 'warning',
      message:
        'Recorded as unidentified. That is genuinely useful — a wrong species is worse than an honest "not sure". The identification guide may help if you still have the tick.',
    };
  }

  if (!findSpecies(value)) {
    return {
      severity: 'warning',
      message: 'We have no reference entry for that species, so the risk model will use a neutral weight.',
    };
  }

  return { severity: 'success', message: 'Species recorded.' };
}

function validateNotes(value: string): FieldMessage | undefined {
  if (value.length > MAX_NOTES_LENGTH) {
    return {
      severity: 'error',
      message: `Notes are limited to ${MAX_NOTES_LENGTH} characters. Yours is ${value.length}.`,
    };
  }
  if (value.length > MAX_NOTES_LENGTH * 0.9) {
    return {
      severity: 'warning',
      message: `Approaching the ${MAX_NOTES_LENGTH}-character limit.`,
    };
  }
  return undefined;
}

/** The option offered when the reporter genuinely cannot identify the species. */
export const UNKNOWN_SPECIES = 'Unidentified tick';

export function validateReport(values: ReportFormValues): ValidationResult {
  const result: ValidationResult = {};

  const date = validateDate(values.date);
  if (date) result.date = date;

  const time = validateTime(values.time);
  if (time) result.time = time;

  const location = validateLocation(values.location);
  if (location) result.location = location;

  const species = validateSpecies(values.species);
  if (species) result.species = species;

  const notes = validateNotes(values.notes);
  if (notes) result.notes = notes;

  return result;
}

/** True when nothing blocks submission. Warnings deliberately do not block. */
export function hasBlockingErrors(result: ValidationResult): boolean {
  return Object.values(result).some((message) => message?.severity === 'error');
}

export function countBySeverity(result: ValidationResult, severity: FieldSeverity): number {
  return Object.values(result).filter((message) => message?.severity === severity).length;
}

/* ------------------------------------------------------------ Image rules */

export const MAX_IMAGE_SIZE_MB = Number(import.meta.env.VITE_MAX_IMAGE_SIZE_MB ?? 5);
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export interface ImageValidation {
  severity: FieldSeverity;
  message: string;
}

/**
 * Validates a chosen file before it is read.
 *
 * Checks the MIME type rather than the extension, because a renamed file would
 * pass an extension check and then fail to decode. Note this is still a
 * client-side check only: it protects the user from an obvious mistake, not the
 * app from a determined one. With a real backend the same rules would have to be
 * re-applied server-side, and the README says so.
 */
export function validateImageFile(file: File): ImageValidation | null {
  const sizeMb = file.size / (1024 * 1024);

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return {
      severity: 'error',
      message: `That file is a ${file.type || 'unrecognised type'}. Please choose a JPEG, PNG, WebP or HEIC image.`,
    };
  }

  if (sizeMb > MAX_IMAGE_SIZE_MB) {
    return {
      severity: 'error',
      message: `The image is ${sizeMb.toFixed(1)} MB, over the ${MAX_IMAGE_SIZE_MB} MB limit. Most phones can export a smaller version.`,
    };
  }

  // Browser storage is the constraint here, not bandwidth — see localReports.ts.
  if (sizeMb > MAX_IMAGE_SIZE_MB * 0.6) {
    return {
      severity: 'warning',
      message: `At ${sizeMb.toFixed(1)} MB this is a large image. It will be stored in this browser, which has limited space.`,
    };
  }

  return null;
}
