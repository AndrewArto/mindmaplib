# mindmaplib Demo Deployment Runbook

Status: project memory for deploying the mindmaplib `demo/` package to
`mapdemo.tripleadigital.io` via Cloudflare Pages.

This is the single source of truth for **access** and **delivery** to the demo's
public host. Dev rules live in `AGENTS.md` and `docs/runbooks/DEVELOPMENT_PROCESS.md`
(summarised in §5); this runbook covers everything needed to ship the build.

> Scope note: this file is **project memory**, intentionally separate from any
> agent's general profile memory. Keep deployment facts here, not in chat bots'
> global notes.

---

## 1. What ships where

| Item            | Value                                                  |
| --------------- | ------------------------------------------------------ |
| Public URL      | `https://mapdemo.tripleadigital.io`                    |
| Host            | Cloudflare Pages                                       |
| Source repo     | `github.com/AndrewArto/mindmaplib` (PRIVATE, MIT)      |
| Default branch  | `main`                                                 |
| Build package   | `demo/` (Vite + vanilla TS, workspace member)          |
| Build output    | `demo/dist` (Vite default)                             |
| Project name    | `mindmaplib-demo`                                      |

The demo is a standalone Vite app that imports `@mindmaplib/core` (and later
`@mindmaplib/react`) exactly as an external consumer would. It is NOT published
to npm. Its only job: prove the library is embeddable, live and interactive.

State as of 2026-07-05: `demo/` does not exist yet (declared in
`pnpm-workspace.yaml` and `AGENTS.md`). No CF Pages project and no DNS record
for `mapdemo` exist yet. This runbook is ready for when the package is built.

---

## 2. Cloudflare access (copied from tripleadigital.io project)

Account: **TripleA Digital (Andrey)**.

| Field        | Value                                              |
| ------------ | -------------------------------------------------- |
| Account ID   | `ca736f2df3f666a941492679c231c291`                 |
| Zone         | `tripleadigital.io`                                |
| Zone ID      | `295caade661965586b4e9c7c6d57844d`                 |
| API token    | stored in `TOOLS.md` on the Mac mini workspace, key prefix `cfut_` |

### Where the token lives (NEVER commit it)

The CF API token is **not** in this repo. It lives in:

```
/Users/andery-mini/.openclaw/workspace/TOOLS.md
  → section "### Cloudflare (Andrey / TripleA Digital)" → "API Token: cfut_…"
```

Extract it at runtime, do not paste into commits, docs, or PRs:

```bash
CF_TOK=$(grep -o 'cfut_[A-Za-z0-9]*' \
  /Users/andery-mini/.openclaw/workspace/TOOLS.md | head -1)
```

The token is verified active (id `46ea1245…`). It covers Pages, DNS, Workers,
D1 for this account. Same token already deploys `tripleadigital.io`,
`labsaas`, `state-of-ai`, `agentgate`.

### Mac mini access (where builds/git run)

```
ssh -i ~/.ssh/hermes_macmini hermes@100.110.226.2
workspace: /Users/andery-mini/.openclaw/workspace
repo:      /Users/andery-mini/.openclaw/workspace/mindmaplib
```

Git push must run as user `andery-mini` (owns the SSH keys). Hermes user is in
the `agentdev` group for read/edit. Pattern (copied from tripleadigital.io):

```bash
cd /Users/andery-mini/.openclaw/workspace/mindmaplib
sudo -u andery-mini git add -A
sudo -u andery-mini git commit -m "feat(demo): …"
export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no"
sudo -u andery-mini git push origin main
```

GitHub CLI: `export HOME=/Users/andery-mini GH_CONFIG_DIR=/Users/andery-mini/.config/gh`.

---

## 3. Deployment model — native CF git integration (the only path)

Cloudflare Pages connected directly to the repo. Push to `main` → CF builds →
deploys. No manual upload, no CLI upload tooling, no secrets in the repo.

> **No wrangler.** This project never uses `wrangler` for deploys, locally or in
> CI. Delivery is exclusively git-triggered native CF Pages builds. There is no
> fallback upload path and there should not be one.

### One-time setup (create the project)

Do this once, when `demo/` is scaffolded and `pnpm --filter demo build` produces
`demo/dist`.

1. **Connect the repo** in the CF dashboard (or via API): Pages → Create →
   Connect to Git → `AndrewArto/mindmaplib`. Authorise the Cloudflare GitHub app.
2. **Build configuration:**

   | Setting                | Value                                                  |
   | ---------------------- | ------------------------------------------------------ |
   | Production branch      | `main`                                                 |
   | Framework preset       | `Vite`                                                 |
   | Build command          | `pnpm install --frozen-lockfile && pnpm --filter demo build` |
   | Build output directory | `demo/dist`                                            |
   | Root directory         | `/` (repo root, so pnpm-workspace.yaml is visible)     |
   | Environment variable   | `NODE_VERSION=22` (matches `.nvmrc`)                   |

   CF Pages reads `.nvmrc` for the Node version if present; setting
   `NODE_VERSION=22` is belt-and-suspenders.

3. **Add the custom domain** `mapdemo.tripleadigital.io` under the project →
   Custom domains. CF auto-provisions a CNAME (the project's `*.pages.dev`
   subdomain) into the `tripleadigital.io` zone. Since both the project and the
   zone are in the same CF account, DNS is created for you — no manual record.

   Equivalent via API (token from TOOLS.md):

   ```bash
   CF_TOK=$(grep -o 'cfut_[A-Za-z0-9]*' \
     /Users/andery-mini/.openclaw/workspace/TOOLS.md | head -1)
   ACCT=ca736f2df3f666a941492679c231c291
   curl -X POST \
     "https://api.cloudflare.com/client/v4/accounts/$ACCT/pages/projects/mindmaplib-demo/domains" \
     -H "Authorization: Bearer *** \
     -H "Content-Type: application/json" \
     -d '{"name":"mapdemo.tripleadigital.io"}'
   ```

### Ongoing delivery

Just push to `main`. CF builds the demo and serves it at
`mapdemo.tripleadigital.io`. Monitor: CF dashboard → project → Deployments, or:

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCT/pages/projects/mindmaplib-demo/deployments" \
  -H "Authorization: Bearer *** \
  | python3 -c "import sys,json; [print(d['id'][:8], d['created_on'], d['latest_stage']['name'], d['latest_stage']['status']) for d in (json.load(sys.stdin).get('result') or [])[:5]]"
```

`deployment_trigger.type` is `github_connections` for native git. Use it to
confirm the active mode.

---

## 4. Verification after every deploy

CF caches static assets (`max-age=14400, s-maxage=604800`). Always verify with
a cache-busting URL:

```bash
# Should be 200 + the demo HTML (not an old version):
curl -sI "https://mapdemo.tripleadigital.io/?bust=$(date +%s)" | head -5

# A JS asset should be application/javascript, not text/html (text/html = SPA
# fallback = file missing from the deploy):
curl -sI "https://mapdemo.tripleadigital.io/assets/index.js?bust=$(date +%s)" | grep -i content-type
```

Purge cache if a fix does not appear (and force a fresh deploy with an empty
commit if the build output is unchanged):

```bash
ZONE=295caade661965586b4e9c7c6d57844d
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/purge_cache" \
  -H "Authorization: Bearer *** \
  -H "Content-Type: application/json" \
  -d '{"purge_everything":true}'
```

---

## 5. Development rules (quick reference — copied from mindmaplib)

Authoritative: `AGENTS.md` and `docs/runbooks/DEVELOPMENT_PROCESS.md`. The demo
follows the **same** rules as the rest of the monorepo. Highlights:

- `demo/` MAY import from `packages/core/` and `packages/react/`. It MUST NOT be
  imported by anything. Boundary check: `pnpm check-boundaries`.
- If `demo/` needs something from `core` not in the public exports, the public
  API has a gap — fix the API, never reach into internals.
- Production TS is strict, zero `any`. Warnings are errors.
- Every non-trivial change needs TDD evidence (red → green) and an audit packet
  (`docs/audit/YYYY-MM-DD-<slug>.md`).
- Every PR needs 2 rounds of `codex review --base origin/main` before merge.
- Commit prefixes: `feat(demo):`, `fix(demo):`, `refactor(demo):`,
  `docs(demo):`, `chore(demo):`. Demo scope is `demo`.

### Commands (from repo root)

```bash
pnpm install                          # all workspace deps
pnpm --filter demo dev                # Vite dev server, localhost:5173
pnpm --filter demo build              # production build → demo/dist
pnpm format --check && pnpm lint && pnpm typecheck && pnpm test && pnpm check-boundaries
pnpm run ci                           # full local gate
```

### Git hygiene before pushing a demo deploy

```bash
git diff --check
git status --short
git add <specific-files>              # stage ONLY task files
git diff --cached --stat
```

---

## 6. Security checklist

- **No secrets in commits.** The CF token stays in `TOOLS.md` on the Mac mini.
  `.gitignore` already excludes `.env`, `.env.*`, `node_modules/`, `dist/`,
  `coverage/`. Do not add the token, account-wide keys, or `.env` files.
- **`dist/` is gitignored** — build output is never committed; CF builds it.
- If the repo ever goes public (MIT suggests it might), nothing in git should
  leak: there are no tokens in this runbook, only account/zone IDs (infra
  identifiers, already public via DNS/headers).
- Never `git add -A` blindly — check `git status` first (pattern learned from
  the tripleadigital.io 2FA files that sat uncommitted in the working tree).

---

## 7. Troubleshooting

- **Custom domain stuck "Initializing":** confirm the CNAME exists in the
  `tripleadigital.io` zone (`mapdemo` → `mindmaplib-demo.pages.dev`). Same-zone
  + same-account usually auto-creates it; if not, add manually.
- **Build fails on CF:** CF must see `pnpm-workspace.yaml` at repo root — keep
  Root directory `/`. Confirm `NODE_VERSION=22`. Run
  `pnpm --filter demo build` locally first to reproduce.
- **Old version served:** CDN cache — purge (§4), then empty-commit + push to
  force a fresh build.
- **Env var not picked up by git deploy:** re-push after adding it via the
  dashboard/API; CF only injects env vars at build time on a fresh deploy.
