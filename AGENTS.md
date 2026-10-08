# Rinspace public frontend instructions

In the maintainer workspace, read `/home/ubuntu/WORKSPACE.md` and `/home/ubuntu/AGENTS.md`.
External contributors need only this public tree; no private configuration or account is required.

## Source ownership and activation boundary

- `rinspacehq/rinspace-web` is the canonical frontend repository. Preserve history, contributions,
  issues/PRs, license and attribution. `lunifans` is a personal identity, not an alternative origin.
- The maintainer explicitly authorized formal cutover on 2026-10-08. The activation boundary is
  accepted private fixed-consumer PR #249, its successful checks and the coordinated workspace
  activation record. Until that boundary passes, private `ui/` remains the current source authority.
  After it passes, this repository is the only editable product frontend source; private `ui/`
  trees retained in old branches are recovery evidence and cannot be a second development line.
- The accepted release is original v0.2.1, source 80587145fba20f9f8dc41421513ae0adfba838e8,
  package SHA-256 26657eba596cf6112b34974bbe61cd5e48b2e6597dcab787177cf85ced1d54a3.
  Public/private checks consume those same bytes. Later public main commits do not change a lock
  or automatically activate product deployment. Documentation commits do not rebuild this release.
- Product requirements, backend identity, canonical contracts, private integration and production
  deployment remain owned by rinspacehq/rinspace. The Mastodon fork owns its native inner runtime;
  shared inputs come from the accepted fixed package, with its manifest and compatibility review.
- Earlier migration-preparation ownership restrictions are historical after the recorded activation.
  The workspace record, both repository instructions, private README and release policy must agree
  before source/production cutover. Never infer activation from a newer commit or tag.

## Development and contributions

- Work on a named branch, inspect status and both remote URLs, preserve unrelated changes.
  Frontend source, styles, routes, translations, components and application tests belong here after
  activation. Changes to backend contracts are specified and accepted privately first.
- Start the real client with `node scripts/start-local.mjs`. Own-account authorization supports
  necessary protected-page viewing; it does not promise a complete local business runtime.
  Gitea and inner-world navigation use official webpages. Do not create a local business database.
- Public PRs require ordinary review, DCO and isolated checks without private/production credentials.
  Unreviewed code must never execute on a private or production runner. Do not bypass required
  checks, modify dependency package source, or synchronize external PRs automatically.
- A separate open-source module needs its own approved repository/package identity and private
  specification. It is not added here merely because it shares frontend dependencies.

## Immutable release consumption

- A candidate is built once from an exact reviewed public commit. Public checks and actual private
  integration, including rollback, must validate that same artifact digest and compatibility.
- The private product locks the exact version, URL, source SHA, integrity, manifest, evidence,
  compatibility, integration commit and change ID. Never consume main/latest or patch compiled
  JS/CSS to pass integration. An ordinary public commit or release is not deployment authorization.
- Keep original package notices, licenses, SBOM and provenance. The exact license for
  @cloudbase/wx-cloud-client-sdk@1.8.10 remains unknown; the approved distribution decision retains
  that disclosure and does not establish third-party permission.
- Public browser configuration is non-secret. Never commit account credentials, callbacks, profiles,
  production env files, internal operations, real user content or build output.
- Existing private-main-only and production environment gates remain. Source export, publication,
  build dispatch, release and deployment require the applicable maintainer authorization.

Run `git diff --check` and appropriate checks; report only actual results. Keep English/Chinese
status consistent. The current official legal-document source remains privately owned; public
copies are derived inputs and do not silently amend terms.
