# Provenir

> Real-time content authenticity scoring — detecting AI generation, plagiarism, and verifying provenance as you browse.

Provenir attaches a score badge to every article you read.  Behind the badge is a multi-signal pipeline that weighs C2PA cryptographic provenance, AI-generation probability, plagiarism cleanliness, source registration age, and domain reputation into a single 0–100 authenticity score.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                      │
│                                                               │
│  ┌────────────────┐      message      ┌──────────────────┐   │
│  │  content.ts    │ ─────────────────▶│  background.ts   │   │
│  │                │                   │  (service worker) │   │
│  │  • Extract text│◀─────────────────  └────────┬─────────┘   │
│  │  • Run WASM    │    score response            │ fetch       │
│  │  • Inject badge│                              ▼            │
│  └────────────────┘              ┌───────────────────────┐   │
│        │ imports                 │  Cloudflare Worker    │   │
│        ▼                        │  POST /api/score       │   │
│  ┌────────────────┐              │                       │   │
│  │  provenir-core │              │  • KV cache check     │   │
│  │  (WASM)        │              │  • D1 provenance DB   │   │
│  │                │              │  • GPTZero (AI)       │   │
│  │  • BLAKE3 hash │              │  • Copyscape (plagiarism) │
│  │  • Entropy     │              │  • Wayback (first-seen)│   │
│  │  • C2PA parse  │              │  • Composite scorer   │   │
│  └────────────────┘              └───────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Components

| Directory | Language | Purpose |
|-----------|----------|---------|
| `crates/provenir-core` | Rust → WASM | Content fingerprinting (BLAKE3), Shannon entropy + sentence burstiness signals, C2PA manifest parsing |
| `extension/` | TypeScript + Lit | Chrome & Firefox MV3 extension: content extraction, badge UI |
| `worker/` | TypeScript (Cloudflare Workers) | Scoring orchestration, external API fan-out, D1/KV persistence |

### Scoring model

| Signal | Weight |
|--------|--------|
| C2PA manifest present | 20% |
| AI generation score (GPTZero) | 25% |
| Plagiarism clean (Copyscape) | 20% |
| Provenance registered | 15% |
| First-seen origin (Wayback) | 10% |
| Domain reputation | 10% |

---

## Running locally

### Prerequisites

- Rust stable + `wasm-pack` (`cargo install wasm-pack`)
- Node.js 20+
- Wrangler CLI (`npm i -g wrangler`)
- A Cloudflare account with D1 and KV enabled

### 1. Build the WASM library

```bash
cd crates/provenir-core
wasm-pack build --target web --out-dir ../../extension/src/wasm
```

### 2. Start the Worker locally

```bash
cd worker
npm install
# Create local D1 and apply schema
wrangler d1 create provenir-db --local
wrangler d1 execute provenir-db --local --file=src/schema.sql
# Start dev server (binds to localhost:8787)
npm run dev
```

Update `extension/src/background.ts` → `DEFAULT_WORKER_URL` to `http://localhost:8787` for local development, or set it via the extension's storage:

```js
// Run in the browser console on any page while the extension is loaded
chrome.storage.local.set({ workerUrl: "http://localhost:8787" });
```

### 3. Load the extension

```bash
cd extension
npm install
npm run dev   # launches a browser with the extension pre-loaded via wxt
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT OR Apache-2.0
