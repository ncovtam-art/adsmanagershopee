# Internal web trial — minhtam.click

Prepared 2026-10-24. This is a reviewable deployment plan, not a live deployment
or production-readiness claim. The owner confirmed an existing website running
on Vercel at `minhtam.click`. Its project/repository binding, DNS provider and
Render/Supabase availability have not yet been established. Preserve that site.
The optional Render artifact proposes `trial.minhtam.click` for a separate trial;
that subdomain is not approved, configured or verified and no DNS was changed.

## Implemented and checked

- CLI migration/owner/worker/backup scripts now preload `scripts/load-env.mjs`
  before importing application services. The official Next environment loader
  preserves inherited process variables and uses Next `.env*` precedence. It
  does not load `.env.example` or print file contents on parse failures.
- All Graph mutations share a fail-closed gateway guard. Writes require BOTH
  `DRY_RUN=false` and `META_WRITES_ENABLED=true`; unset/other values block before
  HTTP requests. OAuth code exchange and reads remain available. This trial must
  retain `DRY_RUN=true` and `META_WRITES_ENABLED=false`.
- Production Compose defaults to web only. Insights, publisher, Ads and Care
  workers require the explicit `workers` profile; do not enable it for this trial.
- Docker healthcheck follows the runtime `PORT`, defaulting to 3000, so a hosting
  platform's injected port does not disagree with the Next server.
- Optional Render Docker artifact: `deploy/render.trial.yaml`. It defines only a
  web service, persistent private media, exact HTTPS Origin/callback, disabled
  writes/LIVE flags and secret placeholders. Auto-deployment is disabled.
  It is not a Vercel configuration. Creating its service/disk can incur charges;
  no resource has been provisioned or purchase approved by this document.

## Validation evidence

- PASS: typecheck and lint.
- PASS: all 80 unit tests, executed file-by-file with
  `node --import tsx tests/unit/<name>.test.ts`; no failed or missing reports.
  New fixtures verify environment precedence, 42 blocked mutation attempts with
  zero fetch calls, and read/OAuth behavior while DRY_RUN is enabled.
- PASS: production `npm run build` outside the process-restricted sandbox.
- PASS: YAML syntax and invariant checks for the Render artifact. Actual Render
  API/schema validation and provisioning remain unverified.
- PASS: `docker compose ... config` with non-secret fixture variables: default
  configuration contains only web; explicit workers profile adds worker services.
  No containers, migrations, jobs, accounts or volumes were started/changed.
- BLOCKED: integration/e2e acceptance against a dedicated test database and Redis,
  authenticated browser/session tests, image runtime smoke, actual domain/TLS,
  database backup/restore and OAuth callback. This checkout has no application
  database URL, original encryption key or newly rotated Meta credentials.
- UNVERIFIED: real Meta permissions, Graph version support, App Review, provider
  APIs, remote media/publishing and Ads. Paid API/LIVE operations were not run.

## Required access, supplied privately

1. Confirm which Vercel project/domain configuration currently owns minhtam.click
   and where authoritative DNS is managed. Public project links/names are enough
   for identification; never paste session cookies, passwords or tokens into chat.
2. Confirm the hosting target and its project/team. The current FFmpeg, persistent
   media and long-running workers require suitable server/container infrastructure;
   a Vercel frontend deployment alone does not validate those capabilities.
3. Provide deployment access through a supported scoped integration or attached
   execution environment. This chat currently has no Render, Supabase or DNS API
   binding. Plaintext credentials in messages are not an access mechanism.
4. Securely bind the working DATABASE_URL and original valid 64-hex encryption
   key. Preserve existing users/data. If moving databases, first prove a backup
   and restoration into a separate staging database; never reset the source.
5. Rotate/revoke Meta credentials exposed in history/chat. Securely bind fresh
   App Secret, App ID and a supported Graph version. Verify the exact callback
   `https://trial.minhtam.click/api/meta/callback` in Meta Dashboard only if that
   separate staging domain and hosting target are selected and verified.
6. Confirm the chosen hosting/storage plan and any cost before provisioning.
   A read-only internal trial does not authorize paid AI calls or Meta mutations.

## Activation sequence after prerequisites

Review/preserve unpushed Codespaces changes before incorporating this branch.
Review hosting configuration and database TLS requirements for the chosen provider;
do not disable certificate verification. Import and check staging data separately,
then start web only. Verify health, existing login, session persistence, permission
denials, configuration diagnostics and backup recovery. Validate domain/TLS before
changing APP_ORIGIN on the live project. Keep all LIVE/write/Ads flags locked.
No production publish, merge, DNS change or worker activation has occurred here.

## Current access blockers

There is no Vercel project binding, CLI authentication file, VERCEL_TOKEN,
RENDER_API_KEY or SUPABASE_ACCESS_TOKEN in this environment. A read-only HTTPS
check of minhtam.click was denied by the environment proxy with CONNECT 403,
including the approved external retry; this is not evidence of a website outage.
Next information needed: Vercel project name/link and its connected GitHub
repository/branch, plus a supported scoped deployment connection. Secret values
must be supplied through private environment settings, never chat or source code.
