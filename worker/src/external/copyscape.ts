/**
 * Copyscape plagiarism API client.
 *
 * Uses the CSEARCH endpoint to check raw text for duplicate content.
 * Returns a score in [0, 1]: 1.0 = no matches, lower = more duplication found.
 *
 * Setup: set COPYSCAPE_KEY secret as "username:apikey"
 *   wrangler secret put COPYSCAPE_KEY
 *   > yourusername:your-api-key
 *
 * Pricing: ~$0.03 per search. Results are cached in KV so each unique
 * content hash is only checked once per TTL period.
 *
 * API docs: https://www.copyscape.com/api-guide.php
 */

const COPYSCAPE_API = "https://www.copyscape.com/api/";

// Copyscape recommends no more than ~1500 words; ~8000 chars is a safe limit.
const MAX_CHARS = 8_000;

export async function checkCopyscape(text: string, apiKey: string): Promise<number> {
  const colonIdx = apiKey.indexOf(":");
  if (colonIdx === -1) {
    throw new Error(
      'COPYSCAPE_KEY must be in "username:apikey" format — update the secret via `wrangler secret put COPYSCAPE_KEY`',
    );
  }

  const username = apiKey.slice(0, colonIdx);
  const key = apiKey.slice(colonIdx + 1);
  const input = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

  // Send as POST with a form-encoded body — GET with `t=<text>` hits the
  // 414 URI Too Large limit for any non-trivial article.
  const body = new URLSearchParams({
    o: "csearch",
    u: username,
    k: key,
    c: "5",   // max results to return
    t: input,
  });

  const response = await fetch(COPYSCAPE_API, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000), // Copyscape can be slow on first search
  });

  if (!response.ok) {
    throw new Error(`Copyscape API error ${response.status}`);
  }

  const xml = await response.text();

  // Check for API-level errors returned in the XML body
  const errorMatch = xml.match(/<error>(.*?)<\/error>/s);
  if (errorMatch) {
    throw new Error(`Copyscape error: ${errorMatch[1]}`);
  }

  // Extract match count: <count>N</count>
  const countMatch = xml.match(/<count>(\d+)<\/count>/);
  const count = countMatch ? parseInt(countMatch[1]!, 10) : 0;

  if (count === 0) return 1.0; // fully original — no matches found
  if (count <= 2)  return 0.6; // minor overlap — common for quoted news sources
  return 0.3;                  // significant duplication found
}
