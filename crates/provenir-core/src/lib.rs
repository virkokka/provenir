mod c2pa;
mod hash;
mod signals;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Input payload sent from the content script.
#[derive(Deserialize)]
struct ScoreInput {
    /// Raw article text extracted from the page.
    text: String,
    /// Canonical URL of the page.
    url: String,
    /// Optional raw C2PA manifest JSON embedded in a <meta> tag.
    c2pa_manifest: Option<String>,
}

/// Output returned to the content script, ready to be forwarded to the Worker.
#[derive(Serialize)]
pub struct ScoreOutput {
    /// BLAKE3 hex digest of the normalised text.
    pub content_hash: String,
    /// Shannon entropy and sentence-length variance.
    pub local_signals: signals::LocalSignals,
    /// Parsed C2PA result (absent / present / ai-generated / signed).
    pub c2pa: c2pa::C2paResult,
    /// The URL echoed back so the Worker can correlate.
    pub url: String,
}

/// Entry point called by the content script.
///
/// Accepts a JS object `{ text, url, c2pa_manifest? }` and returns a JS object
/// containing the content hash, local signals, and C2PA result.  The Worker
/// uses these values alongside its own external API calls to produce a final
/// composite score.
#[wasm_bindgen]
pub fn score_content(input: JsValue) -> Result<JsValue, JsValue> {
    // Surface Rust panics as readable JS errors in development builds.
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();

    let input: ScoreInput = serde_wasm_bindgen::from_value(input)
        .map_err(|e| JsValue::from_str(&format!("invalid input: {e}")))?;

    let content_hash = hash::fingerprint(&input.text);
    let local_signals = signals::compute(&input.text);
    let c2pa = c2pa::parse(input.c2pa_manifest.as_deref());

    let output = ScoreOutput {
        content_hash,
        local_signals,
        c2pa,
        url: input.url,
    };

    serde_wasm_bindgen::to_value(&output)
        .map_err(|e| JsValue::from_str(&format!("serialisation error: {e}")))
}
