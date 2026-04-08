# Contributing to Provenir

Thank you for your interest in contributing!  Provenir is an open-source project and welcomes all kinds of contributions: bug fixes, new features, documentation improvements, and more.

---

## Project setup

### Requirements

| Tool | Version | Install |
|------|---------|---------|
| Rust | stable | `rustup toolchain install stable` |
| wasm32 target | — | `rustup target add wasm32-unknown-unknown` |
| wasm-pack | latest | `cargo install wasm-pack` |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) or `nvm install 20` |
| Wrangler | 3.x | `npm i -g wrangler` |

### Clone and bootstrap

```bash
git clone https://github.com/your-org/provenir
cd provenir
```

### Rust / WASM (`crates/provenir-core`)

```bash
# Run unit tests
cargo test --workspace

# Build the WASM package (output lands in extension/src/wasm/)
wasm-pack build crates/provenir-core --target web --out-dir extension/src/wasm
```

### Cloudflare Worker (`worker/`)

```bash
cd worker
npm install

# Apply the D1 schema to a local SQLite database
wrangler d1 create provenir-db --local
wrangler d1 execute provenir-db --local --file=src/schema.sql

# Type check
npm run typecheck

# Start local dev server on :8787
npm run dev
```

Set `GPTZERO_KEY` and `COPYSCAPE_KEY` secrets for a full local run:

```bash
wrangler secret put GPTZERO_KEY
wrangler secret put COPYSCAPE_KEY
```

### Extension (`extension/`)

The extension requires the WASM package to be built first (see above).

```bash
cd extension
npm install

# Type check
npm run typecheck

# Open a browser with the extension loaded (hot-reload enabled)
npm run dev

# Production build for Chrome
npm run build

# Production build for Firefox
npm run build:firefox
```

---

## PR process

1. **Open an issue first** for non-trivial changes so we can agree on the approach before you invest time writing code.
2. Fork the repo and create a branch: `git checkout -b feat/my-feature`.
3. Make your changes.  Follow the conventions below.
4. Run `cargo test` and ensure the extension and worker type-check without errors.
5. Open a pull request against `main`.  The CI workflow will run automatically.
6. A maintainer will review within a few days.  Address feedback with additional commits (do not force-push during review).

### Code conventions

- **Rust**: `rustfmt` defaults, `clippy` with default lints.  All public items should have a doc comment.
- **TypeScript**: strict mode, no `any`.  Prefer `unknown` + type guards for external data.
- **Commit messages**: use the imperative mood, ≤ 72 chars on the subject line.  Reference issues with `Fixes #123`.

---

## Good first issues

If you're looking for a way to contribute, here are some well-scoped starting points:

- **Real GPTZero integration** — replace the mock in `worker/src/external/gptzero.ts` with a real API call.  The integration path is documented in the file.
- **Real Copyscape integration** — same as above for `worker/src/external/copyscape.ts`.
- **Real Wayback CDX integration** — implement `worker/src/external/wayback.ts`.
- **Domain reputation signal** — the composite scorer has a placeholder `domainReputation: 0.5`.  Add a signal source (e.g. Tranco list, NewsGuard, or self-maintained allowlist/blocklist).
- **C2PA signature verification** — `crates/provenir-core/src/c2pa.rs` checks for signature presence but not validity.  Integrate the `c2pa` crate for full cryptographic verification.
- **Options page** — build a `wxt`-powered options page that lets users set the worker URL and toggle signals on/off.
- **Score history** — store recent scores in `chrome.storage.local` and show a history list in a popup.
- **Wasm-pack test harness** — add `wasm-bindgen-test` browser tests for the WASM public API.

---

## Reporting bugs

Please open a GitHub issue with:

1. Steps to reproduce
2. Expected behaviour
3. Actual behaviour (including any console errors)
4. Browser + extension version

---

## Licence

By contributing you agree that your contributions will be licensed under the same MIT OR Apache-2.0 dual licence as the project.
