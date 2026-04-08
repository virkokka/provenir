/**
 * Brave Search API client — content originality proxy.
 *
 * This is NOT a plagiarism checker.  True plagiarism detection requires a
 * full web index (like Copyscape).  Instead, we take a distinctive sentence
 * from the article, search for it as an exact phrase, and use the result
 * count as a rough originality signal:
 *
 *   Few results  → content appears in few places  → likely original
 *   Many results → content is widely reproduced   → possibly copied/syndicated
 *
 * Limitations:
 *   - Brave's index is not exhaustive; some copied content won't be found
 *   - Legitimate news articles get syndicated widely (syndication ≠ plagiarism)
 *   - Very new content won't be indexed yet, biasing toward "original"
 *
 * Because of these limitations this signal carries less weight than a true
 * plagiarism check — see composite.ts for the adjusted weighting.
 *
 * Free tier: 2,000 queries/month — https://api.search.brave.com
 * API docs:  https://api.search.brave.com/app/documentation/web-search/get-started
 */

const BRAVE_API_URL = "https://api.search.brave.com/res/v1/web/search";

/** Target sentence length for the search probe (words). */
const MIN_WORDS = 10;
const MAX_WORDS = 18;

/**
 * Extract a distinctive sentence from the middle of the article.
 * Middle sentences are less likely to be pulled quotes or boilerplate.
 */
function extractProbeSentence(text: string): string | null {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => {
      const words = s.split(/\s+/).length;
      return words >= MIN_WORDS && words <= MAX_WORDS;
    });

  if (sentences.length === 0) return null;

  // Take the sentence closest to the 50% mark of the article
  const mid = Math.floor(sentences.length / 2);
  return sentences[mid] ?? null;
}

/**
 * Score content originality using Brave Search exact-phrase matching.
 * Returns a value in [0, 1]: higher = more likely to be original content.
 */
export async function checkBraveSearch(text: string, apiKey: string): Promise<number> {
  const probe = extractProbeSentence(text);
  if (!probe) {
    // Text is too short or has no suitable sentences — return neutral
    return 0.5;
  }

  const params = new URLSearchParams({
    q: `"${probe}"`,  // exact phrase search
    count: "10",
    safesearch: "off",
    text_decorations: "false",
    result_filter: "web",
  });

  const response = await fetch(`${BRAVE_API_URL}?${params}`, {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`Brave Search API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json() as {
    web?: { results?: unknown[]; totalEstimatedMatches?: number };
  };

  const totalMatches = data.web?.totalEstimatedMatches ?? data.web?.results?.length ?? 0;

  // Score based on how widely this exact phrase appears across the web.
  // Thresholds are intentionally lenient — syndication is common and expected.
  if (totalMatches === 0)  return 0.7; // not indexed yet or genuinely unique
  if (totalMatches <= 3)   return 0.9; // appears on very few pages — original
  if (totalMatches <= 10)  return 0.8; // light syndication — normal for news
  if (totalMatches <= 30)  return 0.6; // moderate syndication — uncertain
  if (totalMatches <= 100) return 0.4; // heavily reproduced
  return 0.2;                          // viral copy or spam farm
}
