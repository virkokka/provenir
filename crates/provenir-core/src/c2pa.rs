use serde::{Deserialize, Serialize};

/// Simplified result of attempting to parse a C2PA manifest.
///
/// The full C2PA spec (Coalition for Content Provenance and Authenticity)
/// is complex.  We extract only the three signals most relevant to
/// Provenir's scoring model.  The Worker can request full C2PA validation
/// from a dedicated service in the future.
#[derive(Serialize, Debug, PartialEq)]
pub struct C2paResult {
    /// A manifest was found and could be parsed.
    pub present: bool,
    /// The manifest contains an `ai_generated` assertion set to `true`.
    pub ai_generated: bool,
    /// The manifest contains at least one valid-looking signature block.
    /// NOTE: cryptographic signature *verification* is not performed here;
    /// that requires the full C2PA Rust SDK and a trust anchor list.
    pub signed: bool,
}

/// Minimal shape of the C2PA manifest JSON we look for.
/// Real manifests are much richer; we only deserialise the fields we need.
#[derive(Deserialize)]
struct ManifestEnvelope {
    /// `c2pa:claim` or similar top-level claim object.
    #[serde(rename = "c2pa:claim", alias = "claim")]
    claim: Option<Claim>,
    /// Signature block — presence (not validity) is what we check.
    #[serde(rename = "c2pa:signature", alias = "signature")]
    signature: Option<serde_json::Value>,
}

#[derive(Deserialize)]
struct Claim {
    assertions: Option<Vec<Assertion>>,
}

#[derive(Deserialize)]
struct Assertion {
    label: Option<String>,
    data: Option<serde_json::Value>,
}

/// Attempt to parse `manifest_json`.  Returns a result with all fields
/// `false` if the input is `None` or unparseable.
pub fn parse(manifest_json: Option<&str>) -> C2paResult {
    let absent = C2paResult {
        present: false,
        ai_generated: false,
        signed: false,
    };

    let Some(json) = manifest_json else {
        return absent;
    };

    let Ok(envelope) = serde_json::from_str::<ManifestEnvelope>(json) else {
        // JSON present but malformed — treat as absent to avoid false positives.
        return absent;
    };

    let signed = envelope.signature.is_some();

    let ai_generated = envelope
        .claim
        .as_ref()
        .and_then(|c| c.assertions.as_ref())
        .map(|assertions| {
            assertions.iter().any(|a| {
                // The C2PA spec uses `c2pa.ai_generative_training` and
                // `c2pa.ai_inference` assertion labels.  We also check for the
                // common shorthand `ai_generated` used in early implementations.
                let label_match = a.label.as_deref().map(|l| {
                    l.contains("ai_generative") || l.contains("ai_inference") || l == "ai_generated"
                }).unwrap_or(false);

                // Some implementations encode the flag directly in `data.value`.
                let data_match = a.data.as_ref().and_then(|d| {
                    d.get("value").and_then(|v| v.as_bool())
                }).unwrap_or(false);

                label_match || data_match
            })
        })
        .unwrap_or(false);

    C2paResult {
        present: true,
        ai_generated,
        signed,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn none_returns_absent() {
        let r = parse(None);
        assert_eq!(r, C2paResult { present: false, ai_generated: false, signed: false });
    }

    #[test]
    fn malformed_json_returns_absent() {
        let r = parse(Some("{not valid json"));
        assert!(!r.present);
    }

    #[test]
    fn manifest_with_signature_is_signed() {
        let json = r#"{"signature": {"alg": "ES256"}}"#;
        let r = parse(Some(json));
        assert!(r.present);
        assert!(r.signed);
        assert!(!r.ai_generated);
    }

    #[test]
    fn manifest_with_ai_assertion_is_flagged() {
        let json = r#"{
            "claim": {
                "assertions": [
                    {"label": "c2pa.ai_generative_training", "data": {"value": true}}
                ]
            }
        }"#;
        let r = parse(Some(json));
        assert!(r.present);
        assert!(r.ai_generated);
    }
}
