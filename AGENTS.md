# Instructions for frontend migration agents

These instructions apply to the existing `rinspace-web` repository. Read
`/home/ubuntu/WORKSPACE.md` and `/home/ubuntu/AGENTS.md` first when working in this workspace.

## Repository status

- This repository remains canonically located at `rinspacehq/rinspace-web`. `lunifans` is
  the maintainer's personal identity, not an alternative `origin`, authoritative fork or release
  namespace. Do not redirect fetch, push or releases to `lunifans/*` without an explicit
  written ownership migration.
- On 2026-10-04 the sole maintainer approved reuse of this existing repository for frontend
  migration preparation. The former experiment's exclusion from the product chain is not a
  deletion or GitHub archive operation; preserve Git history, issues/PRs and contribution credit.
- Preparation is not source cutover: private `/home/ubuntu/rinspace/ui` remains the only editable
  product frontend until the documented gates pass. Product requirements, backend identity,
  contracts, integration decisions, release and operations remain in the private product repository.
- Rebuild only from its reviewed clean source commit and approved file list. Historical UI, demos,
  packages and workflows are not the migration baseline or current release inputs; never copy
  this old UI into the private product or infer live behavior from it.
- After an explicitly accepted cutover, this repository owns the only editable outer-world frontend
  and fixed frontend releases. Private consumption locks exact version and integrity and requires
  public/private checks of the same immutable candidate; never synchronize PRs automatically.
- A request to open-source a standalone Rinspace module (for example the Milkdown editor) does not
  expand this whole-frontend migration or authorize placing that module here. Such work starts with
  a specification in `/home/ubuntu/rinspace/specs/` and requires a separately approved public
  repository/package identity before any export or publication.

## Allowed changes

The 2026-10-04 approval permits coordinated local policy maintenance and migration preparation; it does
not authorize source export/publication, build dispatch, commits, pushes, releases or deployment.
Frontend export waits for complete source/input, license/notice and sensitive-content review,
approved export scope and a clean private commit. Do not operate a parallel daily product UI here.

The maintainer separately confirmed on 2026-10-05 that the current 1036-file private candidate is
the accepted migration baseline. Named-branch local task commits and local reconstruction here
are permitted after remaining export reviews pass, bound to the digest in WORKSPACE.md.
This does not authorize push, build dispatch, publication, deployment or source/production cutover.
Preserve unrelated edits in the original public working tree; use a named linked worktree for
the replacement candidate, retaining this repository's history and contribution credit.

Source cutover additionally requires independent public checks and private integration against the
same candidate, fixed provenance/compatibility/version/digests, an explicit maintainer acceptance
and removal of duplicate editable private frontend code with a verified rollback artifact.
The existing private-main-only deployment and production guards stay intact until that reviewed
integration change. Ordinary requests or newer public tags do not bypass any of these gates.

If `/home/ubuntu/WORKSPACE.md`, root and both repository instructions, private README or release
policy disagree, stop before export, cutover or release. The private decision record is
`specs/rinspace-web-real-client-open-source/repository-policy.md`; it does not supersede WORKSPACE.

Before changes, inspect branch/status, fetch and push URLs and the current diff. Use a named branch,
preserve unrelated work and keep English/Chinese status notices consistent when changing them.
Do not commit, push, publish, release or deploy unless explicitly authorized.

Future independent development uses complete current page source and necessary public inputs, not
a replacement demo or local business database. Own-account login supports protected page viewing;
Gitea and inner-world navigation go to their official webpages, not locally hosted runtimes.
Browser configuration is public; never include credentials, private user content or internal
operations. Public PR checks use isolated runners without private/production secrets, and unreviewed
candidate code must not execute on a private production runner. License, origin, authorization,
secret scanning, attribution and release safeguards must not be weakened to make checks pass.

## Historical content

README files, contribution guides, specs, route contracts, demo instructions, `world-shell`, release
workflows and legal-document copies below the old tree describe the previous experiment. During
preparation they remain historical, not current Rinspace instructions. Approved replacement notices
must describe the actual migration stage without claiming the repository was closed or archived.
The authoritative legal-document source remains
`/home/ubuntu/rinspace/docs/legal/zh-CN`.

Local commits, tags, packages and generated files do not prove source cutover or production approval.
Historical artifacts and unaccepted candidates must not be consumed by product deployment.

Run `git diff --check` and review status before handoff. Documentation-only policy changes do not
require frontend builds. Report only checks actually run and preserve all license/attribution records.

## Formal frontend cutover stage / 正式前端切换阶段（2026-10-08）

The maintainer explicitly approved proceeding to formal cutover after same-byte v0.2.1
validation. Publication of the exact verified package, complete consumer wiring, normal
PR/checks, coordinated ownership and controlled rollout are authorized. Activation is
pending consumer checks and the coordinated activation record. Existing production
gates, immutable input checks and license disclosures remain required.
