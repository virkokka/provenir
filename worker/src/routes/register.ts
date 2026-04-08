import { Hono } from "hono";
import type { Env } from "../index";

export const registerRoute = new Hono<{ Bindings: Env }>();

/** Body for registering a piece of content's provenance. */
interface RegisterRequest {
  content_hash: string;
  url: string;
  /** ISO-8601 timestamp of original publication, if known by the submitter. */
  published_at?: string;
  /** Optional author identifier (DID, ORCID, or free-form string). */
  author?: string;
}

/**
 * POST /api/register
 *
 * Records the content hash + URL in the provenance table.  Future score
 * requests for the same hash will see `provenance_registered = true`,
 * contributing +15 points to the composite score.
 *
 * Registrations are append-only; the first registration wins for the
 * `first_registered_at` timestamp that the scorer uses.
 */
registerRoute.post("/", async (c) => {
  let body: RegisterRequest;
  try {
    body = await c.req.json<RegisterRequest>();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const { content_hash, url, published_at, author } = body;

  if (!content_hash || !url) {
    return c.json({ error: "content_hash and url are required" }, 400);
  }

  // Check for an existing registration so we can return it without error.
  const existing = await c.env.DB
    .prepare("SELECT registered_at FROM provenance WHERE content_hash = ?")
    .bind(content_hash)
    .first<{ registered_at: string }>();

  if (existing !== null) {
    return c.json({
      registered: false,
      reason: "already_registered",
      registered_at: existing.registered_at,
    });
  }

  const now = new Date().toISOString();
  await c.env.DB
    .prepare(
      `INSERT INTO provenance
         (content_hash, url, published_at, author, registered_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(content_hash, url, published_at ?? null, author ?? null, now)
    .run();

  return c.json({ registered: true, registered_at: now }, 201);
});
