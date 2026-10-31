/// <reference types="vite/client" />

/**
 * Typed environment variables.
 *
 * Without this, `import.meta.env.VITE_ANYTHING` is `any` and a typo in a
 * variable name fails silently at runtime instead of at compile time.
 */
interface ImportMetaEnv {
  /** Override the Elanco API base URL (for a mock server or a proxy). */
  readonly VITE_ELANCO_API_BASE_URL?: string;
  /** Override the XYZ raster tile template. */
  readonly VITE_MAP_TILE_URL?: string;
  /** Attribution HTML matching the tile provider's terms. */
  readonly VITE_MAP_TILE_ATTRIBUTION?: string;
  /** Maximum upload size for sighting photographs, in megabytes. */
  readonly VITE_MAX_IMAGE_SIZE_MB?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
