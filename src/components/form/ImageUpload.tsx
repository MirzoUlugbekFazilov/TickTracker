/**
 * Photograph upload for the report form.
 *
 * Reads the chosen file to a data URL so it can be stored alongside the report
 * and rendered straight back into the detail panel. With a real backend this
 * would be a multipart POST and the component would hold a URL instead — the
 * seam is the `onChange` callback, which is already shaped for that.
 *
 * TWO THINGS WORTH NOTING
 *
 * 1. Images are downscaled before storage. A modern phone photo is 3–6 MB, and
 *    a data URL is ~33% larger than the bytes it encodes. localStorage is
 *    usually capped at 5 MB *in total*, so storing an original would blow the
 *    quota on the first report. Resizing to 1280px on the long edge keeps the
 *    photo diagnostically useful for identifying a tick while fitting several
 *    reports in the budget.
 *
 * 2. There is a required alt-text field. Uploading an image that only sighted
 *    users can interpret would undercut the rest of the accessibility work, so
 *    the person who knows what the photo shows is asked to describe it. It is
 *    prompted rather than silently defaulted, with a usable fallback if skipped.
 */

import { useId, useRef, useState } from 'react';
import { Icon } from '../ui/Icon';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_MB,
  validateImageFile,
  type ImageValidation,
} from '../../lib/validation';

/** Longest edge, in pixels, after downscaling. */
const MAX_DIMENSION = 1280;
/** JPEG quality for the re-encode. 0.82 is near-indistinguishable at this size. */
const JPEG_QUALITY = 0.82;

export interface ImageUploadValue {
  dataUrl: string;
  fileName: string;
  /** Size of the stored data URL in bytes, after downscaling. */
  storedBytes: number;
}

export interface ImageUploadProps {
  value: ImageUploadValue | null;
  onChange: (value: ImageUploadValue | null) => void;
  altText: string;
  onAltTextChange: (value: string) => void;
}

/**
 * Loads, downscales and re-encodes an image file.
 *
 * `createImageBitmap` is used in preference to an `<img>` plus `onload` because
 * it decodes off the main thread and handles EXIF orientation correctly, which
 * matters a great deal for phone photos — a portrait shot would otherwise be
 * stored on its side.
 */
async function processImage(file: File): Promise<{ dataUrl: string; bytes: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('This browser would not let the image be processed.');
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // JPEG rather than preserving the source type: PNG photographs are several
  // times larger for no visible gain, and HEIC cannot be re-encoded at all.
  const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  // A data URL's payload is base64, so its byte length is a good proxy for the
  // storage cost.
  return { dataUrl, bytes: dataUrl.length };
}

export function ImageUpload({ value, onChange, altText, onAltTextChange }: ImageUploadProps) {
  const inputId = useId();
  const altId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<ImageValidation | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File) => {
    const problem = validateImageFile(file);
    if (problem?.severity === 'error') {
      setMessage(problem);
      onChange(null);
      // Clear the input so re-picking the same corrected file still fires change.
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setBusy(true);
    setMessage(problem);

    try {
      const { dataUrl, bytes } = await processImage(file);
      onChange({ dataUrl, fileName: file.name, storedBytes: bytes });
      setMessage(
        problem ?? {
          severity: 'success',
          message: `Image attached and resized to ${Math.round(bytes / 1024)} KB for storage.`,
        },
      );
    } catch {
      setMessage({
        severity: 'error',
        message:
          'That image could not be read. It may be corrupt, or in a format this browser cannot decode — try exporting it as a JPEG.',
      });
      onChange(null);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    onChange(null);
    onAltTextChange('');
    setMessage(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="upload">
      <div className="field">
        <label className="field__label" htmlFor={inputId}>
          Photograph
          <span className="field__optional">Optional</span>
        </label>
        <p className="field__hint" id={`${inputId}-hint`}>
          A clear, close photograph helps confirm the species. JPEG, PNG, WebP or
          HEIC, up to {MAX_IMAGE_SIZE_MB} MB. Images are resized and kept in this
          browser only.
        </p>
      </div>

      {value === null ? (
        <div
          className="upload__dropzone"
          data-dragging={dragging}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
        >
          <Icon name="image" size={28} className="upload__icon" />
          <p className="upload__prompt">Drag a photo here, or choose a file</p>
          <p className="upload__hint">
            Up to {MAX_IMAGE_SIZE_MB} MB &middot; resized to {MAX_DIMENSION}px
          </p>

          {/* The real input stays in the DOM and keeps its own label, rather
              than being hidden behind a styled div. That preserves keyboard
              access and the platform file picker on mobile. */}
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            aria-describedby={`${inputId}-hint`}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
            style={{ maxWidth: '100%' }}
          />

          {busy ? (
            <p className="text-sm" role="status">
              <span className="spinner" aria-hidden="true" style={{ display: 'inline-block' }} />{' '}
              Processing image...
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <div className="upload__preview">
            <img
              className="upload__thumb"
              src={value.dataUrl}
              /* The preview's own alt describes its role in the form; the
                 user's description is for the stored image on the map. */
              alt={`Preview of the photograph you attached: ${value.fileName}`}
            />
            <div className="upload__meta">
              <span className="upload__filename">{value.fileName}</span>
              <span className="text-xs text-muted">
                Stored at {Math.round(value.storedBytes / 1024)} KB after resizing
              </span>
              <button type="button" className="btn btn--sm btn--danger" onClick={clear}>
                <Icon name="trash" size={15} />
                Remove photo
              </button>
            </div>
          </div>

          {/* Alt text is only asked for once there is actually an image. */}
          <div className="field">
            <label className="field__label" htmlFor={altId}>
              Describe the photograph
              <span className="field__optional">Recommended</span>
            </label>
            <p className="field__hint">
              A short description so people using a screen reader know what the
              photo shows. For example: &ldquo;engorged tick attached behind a
              dog&rsquo;s ear&rdquo;.
            </p>
            <input
              id={altId}
              className="input"
              type="text"
              maxLength={160}
              value={altText}
              placeholder="Tick attached to..."
              onChange={(event) => onAltTextChange(event.target.value)}
            />
            {altText.trim() === '' ? (
              <p className="field__warning">
                <Icon name="alert-triangle" size={15} className="field__icon" />
                Without a description, the app will fall back to a generic one
                that cannot say what is actually in the photo.
              </p>
            ) : null}
          </div>
        </>
      )}

      {/* Upload feedback. A live region so the outcome is announced, since the
          visual change (a thumbnail appearing) is not conveyed otherwise. */}
      {message ? (
        <p className={`field__${message.severity}`} role="status">
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
