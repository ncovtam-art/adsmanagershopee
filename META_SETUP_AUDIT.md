# Meta setup diagnostics — 2026-10-22

The Facebook connection screen previously displayed one generic warning for all
configuration failures. It now lists missing or invalid variable names and fixed
repair guidance. No configuration values, URLs, raw exceptions, App Secrets,
tokens or encryption keys are included in the diagnostic payload.

## Changes

- Add a pure configuration diagnostic helper and expose its issues through the
  existing authenticated Meta configuration response. Existing OAuth, Origin,
  authentication and resource permission checks remain in place. The UI keeps
  connecting disabled until the existing validation and diagnostic checks pass.
- Explain the difference between a 64-character hex encryption key and a Facebook
  access token, require preservation of existing keys, and explain exact callback
  matching and server restart requirements.
- Clear App Secret and encryption key fields in the committed example. This does
  not remove historical exposure: the owner must rotate/revoke exposed Meta
  credentials. Existing encrypted records require the original valid key.

## Validation

- PASS: `npm run typecheck`.
- PASS: `npm run lint`.
- PASS: all 71 existing unit tests executed using
  `node --import tsx tests/unit/<file>.test.ts`, one file at a time.
- PASS: six new configuration/template tests using
  `node --import tsx tests/unit/meta-config-status.test.ts`.
- PASS: `npm run build` (outside the process-restricted sandbox). The first
  sandboxed build could not read the TypeScript subprocess output; no source
  workaround or disabled validation was used.
- PASS: `git diff --check`.
- BLOCKED: database integration/browser login and OAuth callback acceptance. This
  `/workspace` checkout has no application database binding, original encryption
  key or fresh Meta credentials; it is separate from the user's `/workspaces`
  Codespace. No database, account, migration, encryption key or session was
  created, reset, rotated or modified here.
- UNVERIFIED: LIVE Graph version support, permissions, App Review and OAuth on
  Meta Dashboard. Syntax validation is not evidence of Meta authorization.

All provider behavior exercised by unit tests uses fixtures. No paid AI calls,
Meta publishing, Ads activation or production deployment was performed. The
ignored local configuration retains DRY_RUN=true and disabled LIVE/Ads flags;
these flags are not a substitute for the existing backend operation guards.

## Continue in the actual Codespace

Review this branch before applying it to the running project. Unpushed changes
from another Codex session are not present in this branch and must be preserved.
In Next development, configuration precedence is process environment,
`.env.development.local`, `.env.local`, `.env.development`, then `.env`.
`.env.example` is not loaded. Existing CLI scripts in this release still load
`.env` explicitly; this change does not claim to have unified CLI environment
loading.

Supply fresh Meta App credentials privately, verify the supported Graph version,
recover the original valid encryption key and original working database URL,
register the exact HTTPS callback, and restart the app. Then verify authenticated
configuration status and OAuth with the owner. Do not put secrets into Git/chat or
generate replacement keys over encrypted data. No production-ready claim is made.
