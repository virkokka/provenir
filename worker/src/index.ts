import { Hono } from "hono";
import { cors } from "hono/cors";
import { scoreRoute } from "./routes/score";
import { registerRoute } from "./routes/register";

/**
 * Shared bindings interface — every route handler receives this as `c.env`.
 * Add new bindings here and in wrangler.toml together.
 */
export interface Env {
  /** D1 SQLite database for provenance records and score audit log. */
  DB: D1Database;
  /** KV namespace used as a short-lived score cache. */
  SCORE_CACHE: KVNamespace;
  /** Hugging Face Inference API token (set via `wrangler secret put`). */
  HF_TOKEN: string;
  /** Brave Search API key for content originality checks (set via `wrangler secret put`). */
  BRAVE_SEARCH_KEY: string;
  /** Copyscape credentials — reserved for future use when credit is available. */
  COPYSCAPE_KEY: string;
  /** Cache TTL in seconds, configurable via [vars] in wrangler.toml. */
  SCORE_CACHE_TTL_SECONDS: string;
}

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(
  "/api/*",
  cors({
    origin: ["chrome-extension://*", "moz-extension://*"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86_400,
  }),
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.route("/api/score", scoreRoute);
app.route("/api/register", registerRoute);

// Health check — useful for smoke-testing deploys
app.get("/health", (c) => c.json({ status: "ok", ts: Date.now() }));

// Fall-through 404
app.notFound((c) => c.json({ error: "not found" }, 404));

export default app;
