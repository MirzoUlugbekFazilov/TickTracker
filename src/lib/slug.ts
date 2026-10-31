/**
 * URL-safe id from a display name. Shared so the anchors generated on the Learn
 * page and the links pointing at them from the detail panel cannot drift apart.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
