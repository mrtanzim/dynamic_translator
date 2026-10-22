// Text normalization utilities for the custom dictionary builder.
//
// Provides Unicode-aware normalization that preserves Bengali (and other
// non-Latin) scripts while stripping punctuation and collapsing whitespace.
// Used by the build pipeline to normalize headwords, meanings, and other
// textual fields before they are written to the columnar dataset.

/**
 * Normalize a text string for dictionary lookup and storage.
 *
 * Steps:
 *   1. Normalize to NFC (Unicode Normalization Form C) so that precomposed
 *      and decomposed character sequences (e.g. Bengali য + nukta vs précomposed
 *      YYA য়) compare equal.
 *   2. Trim leading/trailing whitespace.
 *   3. Lowercase.
 *   4. Strip all characters that are not letters, numbers, marks, or
 *      whitespace. This preserves Bengali vowel signs (combining marks
 *      \p{M}) while removing punctuation.
 *   5. Collapse internal whitespace runs to a single space.
 *   6. Trim again.
 *
 * @param text - The raw input string to normalize.
 * @returns The normalized string, or an empty string if the input is empty
 *          or contains no retainable characters.
 */
export function normalize(text: string): string {
  if (!text) return ''

  return text
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normalize a Bengali text string.
 *
 * This is an alias for {@link normalize}. Bengali vowel signs (e.g. ি, া) are
 * Unicode combining marks (\p{M}), so the \p{M} inclusion in the normalization
 * regex preserves them. A \p{L}-only class would silently corrupt Bengali words.
 *
 * @param text - The Bengali input string to normalize.
 * @returns The normalized Bengali string.
 */
export function normalizeBengali(text: string): string {
  return normalize(text)
}

/**
 * Normalize a headword for dictionary indexing.
 *
 * Headwords are single tokens (no internal spaces). After normalization,
 * any remaining whitespace is stripped entirely so the headword is a single
 * compact token suitable for use as a dictionary key.
 *
 * @param headword - The raw headword string.
 * @returns The normalized headword with all whitespace removed.
 */
export function normalizeHeadword(headword: string): string {
  return normalize(headword).replace(/\s/g, '')
}
