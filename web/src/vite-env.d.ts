/// <reference types="vite/client" />

/**
 * Typed environment variables.
 *
 * Without this, `import.meta.env.VITE_ANYTHING` is `any`, so a typo in a
 * variable name fails silently at runtime instead of at compile time.
 */
interface ImportMetaEnv {
  /**
   * Base URL of the TickTracker API.
   *
   * Defaults to a relative `/api`, which works in development through the Vite
   * proxy and in production when the API is served from the same origin. Set
   * it to an absolute URL when the API is deployed separately from the
   * frontend, which is the case on Vercel.
   */
  readonly VITE_API_BASE_URL?: string;

  /** Override the XYZ raster tile template. Defaults to OpenStreetMap. */
  readonly VITE_MAP_TILE_URL?: string;

  /** Attribution HTML matching the tile provider's terms. */
  readonly VITE_MAP_TILE_ATTRIBUTION?: string;

  /** Maximum upload size for sighting photographs, in megabytes. */
  readonly VITE_MAX_IMAGE_SIZE_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
