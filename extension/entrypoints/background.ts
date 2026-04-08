import type { ScoreResponse } from "../src/types";

const DEFAULT_WORKER_URL = "https://provenir-worker.virkokka.workers.dev";

interface ScoreRequestPayload {
  url: string;
  content_hash: string;
  local_signals: {
    entropy: number;
    sentence_length_variance: number;
    sentence_count: number;
  };
  c2pa: {
    present: boolean;
    ai_generated: boolean;
    signed: boolean;
  };
  text: string;
}

async function getWorkerUrl(): Promise<string> {
  const result = await chrome.storage.local.get("workerUrl");
  return (result["workerUrl"] as string | undefined) ?? DEFAULT_WORKER_URL;
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(
    (
      message: { type: string; payload: ScoreRequestPayload },
      _sender,
      sendResponse,
    ) => {
      if (message.type !== "PROVENIR_SCORE_REQUEST") return false;

      void (async () => {
        try {
          const workerUrl = await getWorkerUrl();
          const res = await fetch(`${workerUrl}/api/score`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(message.payload),
          });

          if (!res.ok) {
            const text = await res.text();
            console.error(`[Provenir] Worker responded ${res.status}: ${text}`);
            sendResponse(null);
            return;
          }

          const data = (await res.json()) as ScoreResponse;
          sendResponse({ score: data.score, breakdown: data.breakdown });
        } catch (err) {
          console.error("[Provenir] Failed to reach Worker:", err);
          sendResponse(null);
        }
      })();

      return true; // keep message channel open for async response
    },
  );
});
