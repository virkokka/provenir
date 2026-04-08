/// Produce a BLAKE3 hex digest of the normalised form of `text`.
///
/// Normalisation removes Unicode whitespace runs and folds to lowercase so
/// that minor formatting differences (extra spaces, mixed case headings) do
/// not produce different hashes for equivalent content.
pub fn fingerprint(text: &str) -> String {
    let normalised = normalise(text);
    let hash = blake3::hash(normalised.as_bytes());
    hash.to_hex().to_string()
}

/// Collapse runs of whitespace, trim, and lowercase.
fn normalise(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut prev_space = true; // treat start-of-string as a space boundary

    for ch in text.chars() {
        if ch.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else {
            for lower in ch.to_lowercase() {
                out.push(lower);
            }
            prev_space = false;
        }
    }

    // Remove trailing space that may have been pushed
    if out.ends_with(' ') {
        out.pop();
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_content_different_whitespace_produces_same_hash() {
        let a = fingerprint("Hello   World\n\nFoo");
        let b = fingerprint("hello world foo");
        assert_eq!(a, b);
    }

    #[test]
    fn different_content_produces_different_hash() {
        let a = fingerprint("authentic article");
        let b = fingerprint("plagiarised article");
        assert_ne!(a, b);
    }

    #[test]
    fn empty_string_is_stable() {
        let h = fingerprint("");
        // BLAKE3 of an empty byte slice — value must be deterministic
        assert_eq!(h.len(), 64); // 256-bit hash → 64 hex chars
    }
}
