/**
 * Domain reputation scoring via RDAP (Registration Data Access Protocol).
 *
 * RDAP is a free, standardised replacement for WHOIS supported by all major
 * registrars.  We use it to determine domain registration age, which is a
 * reliable proxy for trustworthiness: long-established domains are far less
 * likely to be spam, phishing, or churn-and-burn content farms.
 *
 * No API key required — RDAP is a public protocol.
 *
 * RDAP spec: https://www.rfc-editor.org/rfc/rfc9083
 */

interface RdapResponse {
  events?: Array<{
    eventAction: string;
    eventDate: string;
  }>;
}

/**
 * Extract the registrable apex domain from a URL hostname.
 * e.g. "www.news.bbc.co.uk" → "bbc.co.uk"
 *
 * This is a heuristic — for accurate PSL handling a full public suffix list
 * would be needed, but this covers the vast majority of real-world cases.
 */
function apexDomain(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();
  const parts = hostname.split(".");

  // Known two-part second-level TLDs (co.uk, com.au, org.uk, etc.)
  const secondLevelTlds = new Set([
    "co.uk", "org.uk", "me.uk", "net.uk",
    "com.au", "net.au", "org.au",
    "co.nz", "org.nz",
    "co.jp", "co.in",
  ]);

  if (parts.length >= 3) {
    const candidate = parts.slice(-2).join(".");
    if (secondLevelTlds.has(candidate)) {
      return parts.slice(-3).join(".");
    }
  }

  return parts.slice(-2).join(".");
}

/**
 * Score the domain of `url` based on how long it has been registered.
 * Returns a value in [0, 1]; throws on unrecoverable errors so the caller
 * can fall back to a neutral 0.5 via Promise.allSettled.
 */
export async function checkDomainReputation(url: string): Promise<number> {
  const apex = apexDomain(url);

  const response = await fetch(`https://rdap.org/domain/${apex}`, {
    headers: { Accept: "application/rdap+json, application/json" },
    signal: AbortSignal.timeout(5_000),
  });

  // 404 = domain not found; 403 = TLD blocks public RDAP (common for .ai, .io, etc.)
  // Both are unresolvable — return neutral rather than penalising the domain.
  if (response.status === 404 || response.status === 403) return 0.5;

  if (!response.ok) {
    throw new Error(`RDAP error ${response.status} for ${apex}`);
  }

  const data = (await response.json()) as RdapResponse;

  const registrationEvent = data.events?.find(
    (e) => e.eventAction === "registration",
  );

  if (!registrationEvent?.eventDate) return 0.5; // can't determine age

  const registeredAt = new Date(registrationEvent.eventDate);
  if (isNaN(registeredAt.getTime())) return 0.5;

  const ageYears =
    (Date.now() - registeredAt.getTime()) / (1_000 * 60 * 60 * 24 * 365.25);

  if (ageYears >= 15) return 1.0;
  if (ageYears >= 10) return 0.9;
  if (ageYears >= 7)  return 0.8;
  if (ageYears >= 3)  return 0.7;
  if (ageYears >= 1)  return 0.5;
  return 0.3; // brand-new domain — suspicious
}
