/**
 * Report a sighting — core requirement 4.
 *
 * VALIDATION TIMING
 * -----------------
 * Validation runs on every change but messages are only *shown* for fields the
 * user has already touched, plus everything once submit has been attempted.
 * Validating a required field the moment the form mounts would paint it red
 * before the user has typed a character, which reads as an accusation; waiting
 * until submit to say anything means a wall of errors at the end. Touched-field
 * validation is the middle ground, and it is why `touched` is tracked per field
 * rather than as one flag.
 *
 * ERRORS BLOCK, WARNINGS DO NOT
 * -----------------------------
 * See `lib/validation.ts`. A 3am sighting or a location outside the dataset is
 * surfaced as a warning and still submits: the reporter was there and the app
 * was not.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Alert, Spinner } from '../ui/primitives';
import { ImageUpload, type ImageUploadValue } from './ImageUpload';
import { CITY_NAMES } from '../../data/cities';
import { SPECIES } from '../../data/species';
import {
  MAX_NOTES_LENGTH,
  UNKNOWN_SPECIES,
  countBySeverity,
  hasBlockingErrors,
  todayInputValue,
  validateReport,
  type FieldName,
  type ReportFormValues,
} from '../../lib/validation';
import { ApiError } from '../../lib/api';
import type { NewSightingPayload } from '../../types/sighting';

const EMPTY_VALUES: ReportFormValues = {
  date: '',
  time: '',
  location: '',
  species: '',
  notes: '',
  imageAlt: '',
};

export interface ReportSightingFormProps {
  /** Rejects with an ApiError carrying field-level details on a 400. */
  onSubmit: (payload: NewSightingPayload) => Promise<unknown>;
}

export function ReportSightingForm({ onSubmit }: ReportSightingFormProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Pre-fill from the detail panel's "Report a sighting" quick action, so a
  // user who clicks through from a marker does not retype what we already know.
  const [values, setValues] = useState<ReportFormValues>(() => ({
    ...EMPTY_VALUES,
    location: searchParams.get('location') ?? '',
    species: searchParams.get('species') ?? '',
  }));

  const [touched, setTouched] = useState<Set<FieldName>>(new Set());
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [image, setImage] = useState<ImageUploadValue | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverIssues, setServerIssues] = useState<Array<{ field: string; message: string }>>([]);
  const [submitted, setSubmitted] = useState<{ location: string; species: string } | null>(null);

  const summaryRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const formId = useId();

  const validation = useMemo(() => validateReport(values), [values]);
  const blocked = hasBlockingErrors(validation);
  const errorCount = countBySeverity(validation, 'error');
  const warningCount = countBySeverity(validation, 'warning');

  const shouldShow = (field: FieldName) => submitAttempted || touched.has(field);

  const markTouched = (field: FieldName) =>
    setTouched((current) => {
      if (current.has(field)) return current;
      const next = new Set(current);
      next.add(field);
      return next;
    });

  const update = <K extends FieldName>(field: K, value: ReportFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setSubmitError(null);
  };

  // Move focus to the error summary when a submit is rejected, so a keyboard or
  // screen-reader user is taken straight to what went wrong rather than being
  // left at the submit button with no feedback they can perceive.
  useEffect(() => {
    if (submitAttempted && blocked) summaryRef.current?.focus();
  }, [submitAttempted, blocked]);

  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setSubmitError(null);
    setServerIssues([]);

    if (hasBlockingErrors(validateReport(values))) return;

    const species = values.species;
    setSubmitting(true);

    try {
      await onSubmit({
        date: values.date,
        time: values.time,
        location: values.location.trim(),
        species,
        ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
        ...(image ? { imageDataUrl: image.dataUrl } : {}),
        ...(image && values.imageAlt.trim() ? { imageAlt: values.imageAlt.trim() } : {}),
      });

      setSubmitted({ location: values.location.trim(), species });

      // Reset so a second sighting can be reported without a reload.
      setValues(EMPTY_VALUES);
      setImage(null);
      setTouched(new Set());
      setSubmitAttempted(false);
    } catch (error) {
      // The server validates independently of the browser — it has to, since
      // client-side validation is a courtesy and not a security boundary. Its
      // field-level messages are surfaced rather than replaced with a generic
      // failure, so the user can actually fix the problem.
      if (error instanceof ApiError) {
        setSubmitError(error.message);
        if (error.details?.length) setServerIssues(error.details);
      } else {
        setSubmitError(
          'The report could not be saved. Check that the API is running and try again.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------------------------------- Success screen */

  if (submitted) {
    return (
      <div
        className="stack"
        ref={successRef}
        tabIndex={-1}
        style={{ outline: 'none', gap: 'var(--space-5)' }}
      >
        <Alert tone="success" title="Sighting recorded" live="polite">
          <p>
            Your {submitted.species.toLowerCase()} sighting in{' '}
            <strong>{submitted.location}</strong> has been saved. It now appears
            on the map with a square marker, and it is included in the charts and
            timelines alongside the Elanco data.
          </p>
        </Alert>

        <Alert tone="info" title="What happened to your report">
          <p>
            It was sent to the TickTrack API, validated server-side, scored by the
            same severity model that rates the Elanco records, and written to
            PostgreSQL. It is now part of the dataset: it appears on the map, in
            the regional and seasonal aggregates, and in the filter counts.
          </p>
        </Alert>

        <div className="form-actions">
          <button type="button" className="btn btn--primary" onClick={() => navigate('/map')}>
            <Icon name="map-pin" size={18} />
            See it on the map
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setSubmitted(null)}
          >
            <Icon name="plus-circle" size={18} />
            Report another sighting
          </button>
        </div>
      </div>
    );
  }

  /* ----------------------------------------------------------------- Form */

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="stack" style={{ gap: 'var(--space-6)' }}>
      {/* Error summary. A single focusable landmark listing every problem with
          in-page links, which is far quicker to act on than hunting field by
          field. Rendered only after a rejected submit. */}
      {submitAttempted && blocked ? (
        <div ref={summaryRef} tabIndex={-1} style={{ outline: 'none' }}>
          <Alert
            tone="error"
            title={`${errorCount} ${errorCount === 1 ? 'problem' : 'problems'} to fix before this can be submitted`}
            live="assertive"
          >
            <ul style={{ margin: 0, paddingInlineStart: 'var(--space-5)' }}>
              {(Object.entries(validation) as Array<[FieldName, { severity: string; message: string }]>)
                .filter(([, message]) => message.severity === 'error')
                .map(([field, message]) => (
                  <li key={field}>
                    <a href={`#${formId}-${field}`}>{message.message}</a>
                  </li>
                ))}
            </ul>
          </Alert>
        </div>
      ) : null}

      {submitError ? (
        <Alert tone="error" title="Could not save the report" live="assertive">
          <p>{submitError}</p>
          {serverIssues.length > 0 ? (
            <ul style={{ margin: 'var(--space-2) 0 0', paddingInlineStart: 'var(--space-5)' }}>
              {serverIssues.map((issue) => (
                <li key={`${issue.field}-${issue.message}`}>
                  <strong>{issue.field}</strong>: {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}

      <div className="form-grid">
        {/* ------------------------------------------------------- Date */}
        <Field
          id={`${formId}-date`}
          label="Date of sighting"
          required
          hint="When did you see or find the tick?"
          message={shouldShow('date') ? validation.date : undefined}
        >
          {(describedBy, invalid) => (
            <input
              id={`${formId}-date`}
              type="date"
              className="input"
              value={values.date}
              max={todayInputValue()}
              required
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(event) => update('date', event.target.value)}
              onBlur={() => markTouched('date')}
            />
          )}
        </Field>

        {/* ------------------------------------------------------- Time */}
        <Field
          id={`${formId}-time`}
          label="Approximate time"
          required
          hint="An estimate is fine, in 24-hour format."
          message={shouldShow('time') ? validation.time : undefined}
        >
          {(describedBy, invalid) => (
            <input
              id={`${formId}-time`}
              type="time"
              className="input"
              value={values.time}
              required
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(event) => update('time', event.target.value)}
              onBlur={() => markTouched('time')}
            />
          )}
        </Field>

        {/* --------------------------------------------------- Location */}
        <Field
          id={`${formId}-location`}
          label="Nearest city"
          required
          hint="The dataset records sightings by city, so pick the closest one."
          message={shouldShow('location') ? validation.location : undefined}
        >
          {(describedBy, invalid) => (
            <select
              id={`${formId}-location`}
              className="select"
              value={values.location}
              required
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(event) => {
                update('location', event.target.value);
                markTouched('location');
              }}
              onBlur={() => markTouched('location')}
            >
              <option value="">Choose a city...</option>
              {CITY_NAMES.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* ---------------------------------------------------- Species */}
        <Field
          id={`${formId}-species`}
          label="Species"
          required
          hint='Not sure? Choose "Unidentified tick" — an honest unknown is more useful than a guess.'
          message={shouldShow('species') ? validation.species : undefined}
        >
          {(describedBy, invalid) => (
            <select
              id={`${formId}-species`}
              className="select"
              value={values.species}
              required
              aria-invalid={invalid}
              aria-describedby={describedBy}
              onChange={(event) => {
                update('species', event.target.value);
                markTouched('species');
              }}
              onBlur={() => markTouched('species')}
            >
              <option value="">Choose a species...</option>
              {SPECIES.map((species) => (
                <option key={species.name} value={species.name}>
                  {species.name} ({species.latinName})
                </option>
              ))}
              <option value={UNKNOWN_SPECIES}>{UNKNOWN_SPECIES} / not sure</option>
            </select>
          )}
        </Field>
      </div>

      {/* ------------------------------------------------------- Notes */}
      <Field
        id={`${formId}-notes`}
        label="Notes"
        hint="Anything useful: the habitat, what the tick was attached to, whether it was already engorged."
        message={shouldShow('notes') ? validation.notes : undefined}
      >
        {(describedBy, invalid) => (
          <>
            <textarea
              id={`${formId}-notes`}
              className="textarea"
              value={values.notes}
              aria-invalid={invalid}
              aria-describedby={describedBy}
              placeholder="Found on a dog after a walk through long grass..."
              onChange={(event) => update('notes', event.target.value)}
              onBlur={() => markTouched('notes')}
            />
            <p className="field__hint tabular" aria-live="polite">
              {values.notes.length} / {MAX_NOTES_LENGTH} characters
            </p>
          </>
        )}
      </Field>

      {/* ------------------------------------------------------ Image */}
      <ImageUpload
        value={image}
        onChange={setImage}
        altText={values.imageAlt}
        onAltTextChange={(value) => update('imageAlt', value)}
      />

      {/* --------------------------------------------------- Warnings */}
      {warningCount > 0 && (submitAttempted || touched.size > 0) ? (
        <Alert
          tone="warning"
          title={`${warningCount} ${warningCount === 1 ? 'thing' : 'things'} worth checking`}
        >
          These will not stop you submitting &mdash; we would rather have your
          report than a perfect one. Have a look over the highlighted fields if
          anything was a typo.
        </Alert>
      ) : null}

      <div className="form-actions">
        <button
          type="submit"
          className="btn btn--accent btn--lg"
          disabled={submitting}
          aria-disabled={submitting || (blocked && submitAttempted)}
        >
          {submitting ? (
            <>
              <Spinner label="Submitting" />
              Submitting...
            </>
          ) : (
            <>
              <Icon name="check-circle" size={18} />
              Submit sighting
            </>
          )}
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            setValues(EMPTY_VALUES);
            setImage(null);
            setTouched(new Set());
            setSubmitAttempted(false);
            setSubmitError(null);
          }}
        >
          Clear form
        </button>
      </div>

      <p className="text-xs text-muted">
        Fields marked <span className="field__required">*</span> are required.
        Your report is stored in this browser only &mdash; see the note below the
        form.
      </p>
    </form>
  );
}

/* ------------------------------------------------------------------ Field */

/**
 * Wires a label, hint and validation message to one control.
 *
 * The control is supplied as a render prop so this wrapper can hand it the
 * `aria-describedby` it needs — the ids are generated here, and duplicating that
 * wiring at every call site is exactly where describedby bugs come from.
 */
function Field({
  id,
  label,
  required = false,
  hint,
  message,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  message?: { severity: 'error' | 'warning' | 'success'; message: string } | undefined;
  children: (describedBy: string | undefined, invalid: boolean) => React.ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const messageId = message ? `${id}-message` : undefined;
  const describedBy = [hintId, messageId].filter(Boolean).join(' ') || undefined;
  const invalid = message?.severity === 'error';

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="field__optional">Optional</span>
        )}
        {required ? <span className="sr-only">(required)</span> : null}
      </label>

      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}

      {children(describedBy, invalid)}

      {message ? (
        <p
          className={`field__${message.severity}`}
          id={messageId}
          /* Errors interrupt; warnings and confirmations wait their turn. */
          role={message.severity === 'error' ? 'alert' : 'status'}
        >
          <Icon
            name={
              message.severity === 'error'
                ? 'alert-circle'
                : message.severity === 'warning'
                  ? 'alert-triangle'
                  : 'check-circle'
            }
            size={15}
            className="field__icon"
          />
          {message.message}
        </p>
      ) : null}
    </div>
  );
}
