import { Hono } from "hono";
import type { Env } from "../index";
import { computeCompositeScore, type ScoringInputs } from "../scoring/composite";
import { checkHuggingFace } from "../external/huggingface";
// Copyscape gives true plagiarism detection but requires paid credit.
// Re-enable by swapping the import below and restoring plagiarismClean in
// ScoringInputs once credit is available.
// import { checkCopyscape } from "../external/copyscape";
import { checkBraveSearch } from "../external/bravesearch";
import { checkWayback } from "../external/wayback";
import { checkDomainReputation } from "../external/domainreputation";

export const scoreRoute = new Hono<{ Bindings: Env }>();

/** Request body sent by the browser extension. */
interface ScoreRequest {
  url: string;
  content_hash: string;
  local_signals: {
    entropy: number;
    sentence_length_variance: number;
    sentence_count: number;
  };
  c2pa: {
    present: boolean;
    ai_generated: boolean;
    signed: boolean;
  };
  /** Raw article text — forwarded to external APIs that require it. */
  text: string;
}

/** Full response returned to the extension. */
interface ScoreResponse {
  score: number;
  breakdown: ScoringInputs;
  cached: boolean;
  content_hash: string;
}

scoreRoute.post("/", async (c) => {
  let body: ScoreRequest;
  try {
    body = await c.req.json<ScoreRequest>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const { url, content_hash, c2pa, text } = body;

  if (!url || !content_hash || !text) {
    return c.json({ error: "url, content_hash and text are required" }, 400);
  }

  const ttl = Number.parseInt(c.env.SCORE_CACHE_TTL_SECONDS, 10) || 3_600;

  // -------------------------------------------------------------------------
  // 1. KV cache check — avoid redundant API calls for recently scored content
  // -------------------------------------------------------------------------
  const cacheKey = `score:${content_hash}`;
  const cached = await c.env.SCORE_CACHE.get(cacheKey, "json") as ScoreResponse | null;
  if (cached !== null) {
    return c.json({ ...cached, cached: true });
  }

  // -------------------------------------------------------------------------
  // 2. D1 provenance lookup — was this content hash previously registered?
  // -------------------------------------------------------------------------
  const provenanceRow = await c.env.DB
    .prepare("SELECT registered_at FROM provenance WHERE content_hash = ?")
    .bind(content_hash)
    .first<{ registered_at: string }>();

  const provenanceRegistered = provenanceRow !== null;

  // -------------------------------------------------------------------------
  // 3. Fan-out to external APIs concurrently
  // -------------------------------------------------------------------------
  const [hfResult, originalityResult, waybackResult, domainResult] = await Promise.allSettled([
    checkHuggingFace(text, c.env.HF_TOKEN),
    checkBraveSearch(text, c.env.BRAVE_SEARCH_KEY),
    checkWayback(url),
    checkDomainReputation(url),
  ]);

  console.log("[provenir] hf:", hfResult.status === "fulfilled"
    ? hfResult.value
    : `FAILED — ${(hfResult.reason as Error).message}`);
  console.log("[provenir] originality:", originalityResult.status === "fulfilled"
    ? originalityResult.value
    : `FAILED — ${(originalityResult.reason as Error).message}`);
  console.log("[provenir] wayback:", waybackResult.status === "fulfilled"
    ? waybackResult.value
    : `FAILED — ${(waybackResult.reason as Error).message}`);
  console.log("[provenir] domain:", domainResult.status === "fulfilled"
    ? domainResult.value
    : `FAILED — ${(domainResult.reason as Error).message}`);

  // Use a neutral 0.5 if an API call fails so a single failure doesn't
  // collapse the entire score.  The breakdown makes the degraded state visible.
  const aiScore =
    hfResult.status === "fulfilled" ? hfResult.value : 0.5;
  const originalityScore =
    originalityResult.status === "fulfilled" ? originalityResult.value : 0.5;
  const firstSeenScore =
    waybackResult.status === "fulfilled" ? waybackResult.value : 0.5;
  const domainScore =
    domainResult.status === "fulfilled" ? domainResult.value : 0.5;

  // -------------------------------------------------------------------------
  // 4. Composite score computation
  // -------------------------------------------------------------------------
  const inputs: ScoringInputs = {
    c2paPresent: c2pa.present,
    // HF returns probability of being human-written; C2PA ai_generated flag
    // overrides the classifier if the manifest explicitly declares AI origin.
    aiGenerationScore: c2pa.ai_generated ? 0.0 : aiScore,
    originalityScore,
    provenanceRegistered,
    firstSeenScore,
    domainReputation: domainScore,
  };

  const score = computeCompositeScore(inputs);

  // -------------------------------------------------------------------------
  // 5. D1 audit write
  // -------------------------------------------------------------------------
  const now = new Date().toISOString();
  await c.env.DB
    .prepare(
      `INSERT INTO score_audit
         (content_hash, url, score, breakdown_json, scored_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(content_hash, url, score, JSON.stringify(inputs), now)
    .run();

  // -------------------------------------------------------------------------
  // 6. KV cache write
  // -------------------------------------------------------------------------
  const response: ScoreResponse = { score, breakdown: inputs, cached: false, content_hash };
  await c.env.SCORE_CACHE.put(cacheKey, JSON.stringify(response), {
    expirationTtl: ttl,
  });

  return c.json(response);
});
