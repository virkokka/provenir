/** Response shape returned by the Cloudflare Worker's POST /api/score. */
export interface ScoreResponse {
  score: number;
  breakdown: Record<string, unknown>;
  cached: boolean;
  content_hash: string;
}

/** Mirror of the Rust `ScoreOutput` struct returned by the WASM module. */
export interface ScoreOutput {
  content_hash: string;
  local_signals: LocalSignals;
  c2pa: C2paResult;
  url: string;
}

export interface LocalSignals {
  entropy: number;
  sentence_length_variance: number;
  sentence_count: number;
}

export interface C2paResult {
  present: boolean;
  ai_generated: boolean;
  signed: boolean;
}
