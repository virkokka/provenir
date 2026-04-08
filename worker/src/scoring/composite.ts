/**
 * Weighted composite score model.
 *
 * Each input is normalised to [0, 1] where 1 = most authentic.
 * The final score is scaled to [0, 100].
 *
 * Current weights (phase 1 — live signals):
 *   AI generation score     = 45 %  (HuggingFace classifier — high confidence)
 *   Wayback first-seen      = 20 %  (domain archive age — reliable, free)
 *   Domain reputation       = 20 %  (RDAP registration age — reliable, free)
 *   Content originality     = 15 %  (Brave Search exact-phrase proxy)
 *
 * The originality signal (Brave Search) intentionally carries less weight
 * than a true plagiarism check (Copyscape) would.  Brave returns result
 * counts for an exact sentence, not a full-document duplicate analysis.
 * Syndication is common and legitimate, so the signal is noisy.
 * Copyscape integration is available in worker/src/external/copyscape.ts
 * and can be re-enabled when credit is available; its weight would replace
 * the originality weight and some portion of the AI weight.
 *
 * C2PA and provenance registration are modelled as *bonuses* (not required
 * signals) since adoption is near-zero across the current web.  When present
 * they lift the score above the phase-1 ceiling without penalising sites that
 * haven't adopted them yet.
 *
 * Aspirational weights (restore once C2PA / provenance adoption is widespread):
 *   C2PA manifest present   = 20 %
 *   AI generation score     = 25 %
 *   Plagiarism clean        = 20 %
 *   Provenance registered   = 15 %
 *   First-seen origin       = 10 %
 *   Domain reputation       = 10 %
 */

const WEIGHTS = {
  aiGenerationScore:  0.45,
  firstSeenScore:     0.20,
  domainReputation:   0.20,
  originalityScore:   0.15,
} as const satisfies Record<string, number>;

/** Extra weight granted when a C2PA manifest is present. */
const C2PA_BONUS = 0.15;
/** Extra weight granted when provenance is registered. */
const PROVENANCE_BONUS = 0.10;

// Sanity-check the weights at module load time.
const _weightSum = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(_weightSum - 1.0) > 1e-9) {
  throw new Error(`Scoring weights must sum to 1.0, got ${_weightSum}`);
}

export interface ScoringInputs {
  /** Whether a C2PA manifest was present and parseable. */
  c2paPresent: boolean;
  /**
   * Probability the content is human-written (HuggingFace classifier).
   * Range [0, 1].  1 = definitely human.
   */
  aiGenerationScore: number;
  /**
   * Content originality proxy from Brave Search exact-phrase matching.
   * Range [0, 1].  1 = phrase appears on very few pages (likely original).
   * Note: this is NOT a true plagiarism check — see composite.ts header.
   */
  originalityScore: number;
  /** Whether the content hash was found in the provenance registry. */
  provenanceRegistered: boolean;
  /**
   * Domain archive age score from Wayback CDX.
   * 1 = domain has been in the archive for many years (established source).
   */
  firstSeenScore: number;
  /**
   * Domain registration age score from RDAP.
   * 1 = domain registered 15+ years ago.
   */
  domainReputation: number;
}

/**
 * Compute a weighted composite authenticity score in the range [0, 100].
 *
 * C2PA and provenance are bonuses: present → lifts score, absent → no penalty.
 * All inputs outside [0, 1] are clamped.
 */
export function computeCompositeScore(inputs: ScoringInputs): number {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  const bonusTotal =
    (inputs.c2paPresent ? C2PA_BONUS : 0) +
    (inputs.provenanceRegistered ? PROVENANCE_BONUS : 0);

  const baseScale = 1 - bonusTotal;

  const weighted =
    baseScale * WEIGHTS.aiGenerationScore * clamp(inputs.aiGenerationScore) +
    baseScale * WEIGHTS.firstSeenScore    * clamp(inputs.firstSeenScore) +
    baseScale * WEIGHTS.domainReputation  * clamp(inputs.domainReputation) +
    baseScale * WEIGHTS.originalityScore  * clamp(inputs.originalityScore) +
    (inputs.c2paPresent       ? C2PA_BONUS       : 0) +
    (inputs.provenanceRegistered ? PROVENANCE_BONUS : 0);

  return Math.round(weighted * 100);
}
