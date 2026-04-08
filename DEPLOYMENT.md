# Deployment Guide

This guide walks through every step required to go from a fresh clone to a
live Cloudflare Worker and a distributable browser extension.  Follow the
sections in order — later steps depend on earlier ones.

---

## Prerequisites

Install these tools before starting:

```bash
# Rust toolchain + WASM target
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# Node.js 22 (use nvm or your preferred manager)
nvm install 22 && nvm use 22

# Wrangler CLI (Cloudflare Workers)
npm install -g wrangler

# Authenticate wrangler with your Cloudflare account
`wrangler login`
```

You'll also need:
- A **Cloudflare account** (free tier is sufficient to start)
- A **Hugging Face account + API token** — sign up at https://huggingface.co, then generate a token at https://huggingface.co/settings/tokens (a read-only token is sufficient)
- A **Copyscape API key** — sign up at https://www.copyscape.com

---

## Step 1 — Build the WASM library

The WASM package must be built before the extension can be built.
Its output is written directly into the extension source tree.

```bash
cd crates/provenir-core
wasm-pack build --target web --out-dir ../../extension/src/wasm
cd ../..
```

You should see `extension/src/wasm/` populated with:
- `provenir_core_bg.wasm`
- `provenir_core.js`
- `provenir_core.d.ts`

> **Re-run this whenever you change Rust code.**  The extension build
> picks up whatever is in `extension/src/wasm/` at build time.

---

## Step 2 — Create Cloudflare infrastructure

These are one-time setup steps.  Run them once per environment
(e.g. once for production, once for staging if you want it).

### 2a. Create the D1 database

```bash
wrangler d1 create provenir-db
```

Wrangler will print something like:

```
✅ Successfully created DB 'provenir-db'

[[d1_databases]]
binding = "DB"
database_name = "provenir-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

Copy the `database_id` value and paste it into `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "provenir-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # ← paste here
```

### 2b. Apply the database schema

```bash
wrangler d1 execute provenir-db --file=worker/src/schema.sql --remote
```

Confirm by listing tables:

```bash
wrangler d1 execute provenir-db --command="SELECT name FROM sqlite_master WHERE type='table'" --remote
```

Expected output: `provenance`, `score_audit`.

### 2c. Create the KV namespace

```bash
wrangler kv namespace create SCORE_CACHE
```

Wrangler will print:

```
✅ Successfully created namespace 'SCORE_CACHE'
Add the following to your wrangler.toml:
[[kv_namespaces]]
binding = "SCORE_CACHE"
id = "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
```

Paste the `id` into `worker/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SCORE_CACHE"
id = "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"  # ← paste here
```

### 2d. Set secrets

Secrets are stored encrypted by Cloudflare and injected at runtime.
**Never put real keys in `wrangler.toml` or commit them to git.**

```bash
cd worker

wrangler secret put HF_TOKEN
# Paste your Hugging Face API token when prompted (huggingface.co/settings/tokens)

wrangler secret put COPYSCAPE_KEY
# Paste your Copyscape API key when prompted
```

Verify secrets are registered (values are not shown):

```bash
wrangler secret list
```

---

## Step 3 — Deploy the Worker

```bash
cd worker
npm install
npm run deploy
```

Wrangler will print the deployed URL, which looks like:

```
https://provenir-worker.<your-subdomain>.workers.dev
```

Note this URL — you'll need it in the next step.

Test the deployment with a health check:

```bash
curl https://provenir-worker.<your-subdomain>.workers.dev/health
# Expected: {"status":"ok","ts":1234567890000}
```

---

## Step 4 — Configure the extension with the Worker URL

Open `extension/entrypoints/background.ts` and update the default Worker URL:

```typescript
const DEFAULT_WORKER_URL = "https://provenir-worker.<your-subdomain>.workers.dev";
```

---

## Step 5 — Build the extension

```bash
cd extension
npm install

# Chrome (MV3) — output in extension/.output/chrome-mv3/
npm run build

# Firefox (MV3) — output in extension/.output/firefox-mv3/
npm run build:firefox
```

### Load unpacked for testing (Chrome)

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `extension/.output/chrome-mv3/`

### Load unpacked for testing (Firefox)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select any file inside `extension/.output/firefox-mv3/`

Navigate to any article and you should see the Provenir badge appear in the
bottom-right corner within a second or two.

---

## Step 6 — Set up GitHub Actions for CI/CD

The CI workflow runs automatically on every pull request.  The deploy
workflow runs automatically on every push to `main`.  You only need to add
two repository secrets.

### 6a. Get your Cloudflare API token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use the **Edit Cloudflare Workers** template
4. Scope it to your account and the `provenir-worker` service
5. Copy the token

### 6b. Get your Cloudflare Account ID

```bash
wrangler whoami
# Prints your account ID
```

Or find it in the Cloudflare dashboard URL:
`https://dash.cloudflare.com/<ACCOUNT_ID>/...`

### 6c. Add secrets to GitHub

Go to your repo → **Settings** → **Secrets and variables** → **Actions**
→ **New repository secret** for each of:

| Secret name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | The API token from step 6a |
| `CLOUDFLARE_ACCOUNT_ID` | Your account ID from step 6b |

After this, every push to `main` will automatically deploy the Worker.

---

## Step 7 — Publish the extension (optional)

### Chrome Web Store

1. Run `npm run zip` in the `extension/` directory — this produces a
   `.zip` file ready for upload.
2. Go to https://chrome.google.com/webstore/devconsole
3. Create a new item, upload the zip, fill in the store listing, and submit
   for review.

### Firefox Add-ons (AMO)

1. Run `npm run build:firefox` then zip the output:
   ```bash
   cd extension/.output && zip -r ../provenir-firefox.zip firefox-mv3/
   ```
2. Go to https://addons.mozilla.org/developers/
3. Submit a new add-on, upload the zip, and complete the listing.

> Firefox requires the extension source code to be submitted alongside the
> build so reviewers can verify it.  Zip the repo (excluding `node_modules`,
> `target/`, `.output/`) and upload it as the source package.

---

## Local development workflow

For day-to-day development you don't need to redeploy everything.

**Worker (hot-reload on :8787):**
```bash
cd worker && npm run dev
```

**Extension (opens browser with extension pre-loaded):**
```bash
# In a separate terminal, after building WASM:
cd extension && npm run dev
```

Override the Worker URL in the extension without rebuilding:
```typescript
// Run in the browser console on any page
chrome.storage.local.set({ workerUrl: "http://localhost:8787" });
```

**D1 local database** (created automatically by `wrangler dev`):
```bash
# Apply schema to local D1
wrangler d1 execute provenir-db --local --file=worker/src/schema.sql
```

---

## Checklist summary

- [ ] `rustup target add wasm32-unknown-unknown` + `cargo install wasm-pack`
- [ ] `cd crates/provenir-core && wasm-pack build --target web --out-dir ../../extension/src/wasm && cd ../..`
- [ ] `wrangler d1 create provenir-db` → paste ID into `worker/wrangler.toml`
- [ ] `wrangler d1 execute provenir-db --file=worker/src/schema.sql`
- [ ] `wrangler kv namespace create SCORE_CACHE` → paste ID into `worker/wrangler.toml`
- [ ] `wrangler secret put HF_TOKEN`
- [ ] `wrangler secret put COPYSCAPE_KEY`
- [ ] `cd worker && npm install && npm run deploy`
- [ ] Paste Worker URL into `extension/entrypoints/background.ts`
- [ ] `cd extension && npm install && npm run build`
- [ ] Load unpacked extension in browser and verify badge appears
- [ ] Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to GitHub secrets
