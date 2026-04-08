/**
 * Hugging Face Inference API client for AI-generated text detection.
 *
 * Model: Hello-SimpleAI/chatgpt-detector-roberta
 * A RoBERTa classifier fine-tuned to distinguish human-written text from
 * ChatGPT/LLM output.  Returns two labels: "Human" and "ChatGPT".
 *
 * API docs: https://huggingface.co/docs/api-inference/tasks/text-classification
 * Model card: https://huggingface.co/Hello-SimpleAI/chatgpt-detector-roberta
 */

const HF_API_URL =
  "https://router.huggingface.co/hf-inference/models/Hello-SimpleAI/chatgpt-detector-roberta";

/**
 * RoBERTa has a 512-token context window.  We truncate to ~1,800 characters
 * (≈ 400 tokens) — enough to get a reliable signal without hitting the limit.
 */
const MAX_CHARS = 1_800;

/** Shape of one label entry returned by the HF classification endpoint. */
interface HFLabel {
  label: string;
  score: number;
}

/**
 * Classify `text` using the Hugging Face Inference API.
 *
 * Returns a score in [0, 1] representing the probability that the text is
 * human-written.  1 = definitely human, 0 = definitely AI-generated.
 *
 * Throws on unrecoverable errors (4xx except 503) so the caller's
 * Promise.allSettled fan-out can fall back to a neutral 0.5.
 */
export async function checkHuggingFace(text: string, apiKey: string): Promise<number> {
  const input = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;

  const response = await fetch(HF_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: input }),
    // Cloudflare Workers enforce a 30 s subrequest limit; set an explicit
    // timeout so a slow cold-start doesn't silently eat the whole budget.
    signal: AbortSignal.timeout(10_000),
  });

  // 503 means the model is still loading on HF's side (cold start).
  // Throwing here lets the caller fall back to neutral rather than blocking.
  if (response.status === 503) {
    throw new Error("HuggingFace model is loading — falling back to neutral score");
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HuggingFace API error ${response.status}: ${body}`);
  }

  // The inference API wraps results in an outer array (one entry per input).
  const result = (await response.json()) as HFLabel[][];

  const labels = result[0];
  if (!labels) {
    throw new Error("Unexpected HuggingFace response shape");
  }

  // Find the "Human" label score; fall back to inverting the "ChatGPT" score
  // in case the label names change in a future model revision.
  const humanEntry = labels.find((l) => l.label === "Human");
  if (humanEntry !== undefined) {
    return humanEntry.score;
  }

  const aiEntry = labels.find((l) => l.label === "ChatGPT");
  if (aiEntry !== undefined) {
    return 1 - aiEntry.score;
  }

  throw new Error(`Unrecognised HuggingFace label names: ${labels.map((l) => l.label).join(", ")}`);
}
