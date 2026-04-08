use serde::Serialize;

/// Local pre-scoring signals computed entirely client-side without any network
/// round-trip.  These are forwarded to the Worker as hints to the composite
/// scorer and also allow the extension to show an immediate rough estimate
/// before the full server response arrives.
#[derive(Serialize, Debug, PartialEq)]
pub struct LocalSignals {
    /// Shannon entropy of the character distribution in `[0, log2(alphabet)]`.
    /// Very low entropy (< 3.5 bits) is a weak signal for templated / spam
    /// content; very high entropy (> 5.5 bits) may indicate encoded payloads.
    pub entropy: f64,

    /// Variance of sentence lengths (in words).  Human writing has moderate
    /// variance; LLM outputs tend to converge on a narrower band of sentence
    /// lengths, so an unusually low variance is a weak AI-generation signal.
    pub sentence_length_variance: f64,

    /// Number of sentences detected — useful for the Worker to weigh the
    /// reliability of the variance signal (too few sentences → unreliable).
    pub sentence_count: usize,
}

/// Compute `LocalSignals` from raw article text.
pub fn compute(text: &str) -> LocalSignals {
    let entropy = shannon_entropy(text);
    let sentences = split_sentences(text);
    let sentence_count = sentences.len();
    let sentence_length_variance = length_variance(&sentences);

    LocalSignals {
        entropy,
        sentence_length_variance,
        sentence_count,
    }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/// Shannon entropy H = -Σ p(c) · log₂(p(c)) over the character distribution.
fn shannon_entropy(text: &str) -> f64 {
    if text.is_empty() {
        return 0.0;
    }

    // Count occurrences of each Unicode scalar value.
    let mut counts: std::collections::HashMap<char, usize> =
        std::collections::HashMap::with_capacity(128);
    let mut total: usize = 0;

    for ch in text.chars() {
        if !ch.is_whitespace() {
            *counts.entry(ch).or_default() += 1;
            total += 1;
        }
    }

    if total == 0 {
        return 0.0;
    }

    let total_f = total as f64;
    counts.values().fold(0.0, |acc, &count| {
        let p = count as f64 / total_f;
        acc - p * p.log2()
    })
}

/// Rough sentence splitter — splits on `. `, `! `, `? ` and end-of-string.
/// Returns the word count for each detected sentence.
fn split_sentences(text: &str) -> Vec<usize> {
    // Split on terminal punctuation followed by whitespace or end-of-input.
    let raw: Vec<&str> = text
        .split(|c| c == '.' || c == '!' || c == '?')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();

    raw.iter()
        .map(|s| s.split_whitespace().count())
        .filter(|&wc| wc > 0)
        .collect()
}

/// Population variance of a slice of word counts.
fn length_variance(lengths: &[usize]) -> f64 {
    if lengths.len() < 2 {
        return 0.0;
    }

    let mean = lengths.iter().sum::<usize>() as f64 / lengths.len() as f64;
    let variance = lengths.iter().map(|&l| {
        let diff = l as f64 - mean;
        diff * diff
    }).sum::<f64>() / lengths.len() as f64;

    variance
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_returns_zeros() {
        let s = compute("");
        assert_eq!(s.entropy, 0.0);
        assert_eq!(s.sentence_length_variance, 0.0);
        assert_eq!(s.sentence_count, 0);
    }

    #[test]
    fn entropy_is_positive_for_normal_text() {
        let s = compute("The quick brown fox jumps over the lazy dog.");
        assert!(s.entropy > 3.0, "expected entropy > 3.0, got {}", s.entropy);
    }

    #[test]
    fn uniform_text_has_zero_entropy() {
        let s = compute("aaaaaaaaaa");
        // Only one distinct character → entropy = 0
        assert!((s.entropy - 0.0).abs() < 1e-10);
    }

    #[test]
    fn varying_sentence_lengths_produce_nonzero_variance() {
        let text = "Hi. This is a slightly longer sentence. \
                    And here is an even longer one that goes on for quite a few words.";
        let s = compute(text);
        assert!(
            s.sentence_length_variance > 0.0,
            "expected non-zero variance, got {}",
            s.sentence_length_variance
        );
    }
}
