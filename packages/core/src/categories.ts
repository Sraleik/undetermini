/**
 * Plain-text descriptions of the semantic categories used in NL filter eval
 * cases. Used by the console legend to anchor what each category measures.
 *
 * Categories themselves are free strings on the assertion (`category: 'ROLE'`).
 * This registry is for *display only* — it doesn't enforce anything. A category
 * that appears in a case but is missing here just renders without a description.
 *
 * Keep descriptions short (1 sentence) — the legend already lists the
 * individual assertions as bullets underneath.
 */
export const CATEGORY_DESCRIPTIONS_FR: Record<string, string> = {
  // Intentionally empty: category names are spelled out in full (no
  // abbreviations) and are self-explanatory, so the legend renders the bare
  // category header without a description line — cleaner / less visual noise.
};
