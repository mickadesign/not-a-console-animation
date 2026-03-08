/** Converts camelCase CSS property names to kebab-case. Leaves custom properties (--foo) untouched. */
export function camelToKebab(s: string): string {
  if (s.startsWith('--')) return s
  return s.replace(/([A-Z])/g, c => '-' + c.toLowerCase())
}
