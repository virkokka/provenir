/**
 * Internet Archive Wayback Machine CDX API client.
 *
 * Queries the CDX index for the oldest snapshot of the given domain.
 * We use domain-level first-archive age as a proxy for source establishment:
 * a domain that has been in the archive for years is more likely to be
 * a trusted, original source than one that appeared recently.
 *
 * We query the domain with a wildcard (domain/*) rather than the specific
 * article URL — this is more reliable (specific URLs can 400 or return empty
 * on new articles) and gives a better signal about the source overall.
 *
 * CDX API docs: https://github.com/internetarchive/wayback/tree/master/wayback-cdx-server
 */

const CDX_API = "https://web.archive.org/cdx/search/cdx";

export async function checkWayback(url: string): Promise<number> {
  const domain = new URL(url).hostname;

  // Use the glob wildcard pattern — more universally accepted by CDX than
  // matchType=domain with a bare hostname.
  const params = new URLSearchParams({
    url: `*.${domain}/*`,
    output: "json",
    fl: "timestamp",
    limit: "1",  // CDX is chronological by default; limit=1 gives the oldest snapshot
  });

  const response = await fetch(`${CDX_API}?${params}`, {
    headers: {
      "User-Agent": "Provenir/1.0 (content authenticity scorer)",
    },
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Wayback CDX error ${response.status}: ${body.slice(0, 200)}`);
  }

  const rows = (await response.json()) as string[][];

  // rows[0] is the header ["timestamp"], rows[1] is the oldest result.
  // An empty result set means the URL has never been archived.
  const dataRow = rows[1];
  if (!dataRow?.[0]) return 0.5; // not yet crawled — neutral, not suspicious

  // Timestamp format: YYYYMMDDHHmmss
  const year = parseInt(dataRow[0].slice(0, 4), 10);
  const ageYears = new Date().getFullYear() - year;

  if (ageYears >= 5) return 0.9; // very established source
  if (ageYears >= 2) return 0.8;
  if (ageYears >= 1) return 0.7;
  return 0.6;                    // archived recently but does exist
}
