# Licensing Scope

> **Migration preparation:** This private frontend candidate carries the existing Rinspace Web
> licensing terms below for the proposed migration into `rinspacehq/rinspace-web`. The public
> source and private consumer have not switched. The versioned approval below records the existing
> terms, not approval of this candidate's file list, clean commit or publication.

> Version 1.0, dated 2026-09-04. The rights holder has approved the licensing scope and bound the release legal documents to reviewed SHA-256 digests. This approval is based on a disclosed non-lawyer PRC-law review and does not by itself authorize a public release.

Rinspace Web is a combined application containing Rinspace-owned code, third-party software, and separately licensed content and brand assets. A repository-wide license label does not replace those file-specific terms.

## Rinspace-owned software

Except for the exclusions below, software authored and owned by 任务优先（上海）网络科技有限责任公司 is intended to be offered to the community under `AGPL-3.0-only`; see the complete canonical text in [`LICENSE`](./LICENSE). AGPL permits commercial use when its conditions are met. A separately negotiated commercial license is an alternative only for material the company has the right to relicense; see [`COMMERCIAL-LICENSING.md`](./COMMERCIAL-LICENSING.md).

## Animate UI application source

Files under `src/components/animate-ui/` incorporate or adapt material from Animate UI at upstream commit `efeb96ffd7a3b7a4868667e4ac3c346620fb3044`.

- Original Animate UI material: Copyright (c) 2025 Elliot Sutton.
- Rinspace modifications: Copyright (c) 2026 任务优先（上海）网络科技有限责任公司.
- Governing terms for the combined files: the bundled [Animate UI MIT + Commons Clause terms](./licenses/Animate-UI-MIT-Commons-Clause.txt).

Those files are distributed only as part of the Rinspace Web application. They are not represented as Rinspace-only assets, are not relicensed under the Rinspace commercial license, and must not be extracted and sold or redistributed as an original-form component collection or bundle contrary to the upstream terms.

The private `vendor/animate-ui/` catalog is provenance and design-reference material. It is excluded from the public repository and all release artifacts.

## Other third-party and non-software material

Third-party dependencies and retained binary assets are listed in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) and `licenses/`. Any future publication blocker listed there must be resolved before release. The approved scopes for demo data, templates, visual assets, and brand assets are recorded in [`ASSET-LICENSES.md`](./ASSET-LICENSES.md) and [`TRADEMARKS.md`](./TRADEMARKS.md). New or changed material must be reviewed again and does not inherit that approval automatically.

Questions about the applicable scope may be sent to `lunifans@outlook.com`.

## Contributions

Ordinary external contributions use the repository-local [`DCO`](./DCO) 1.1 sign-off described in [`CONTRIBUTING.md`](./CONTRIBUTING.md); no external CLA service is required. Under [`CONTRIBUTION-LICENSE.md`](./CONTRIBUTION-LICENSE.md), contributors retain copyright and license intentional submissions under Apache License 2.0. This gives Rinspace the rights needed to incorporate accepted contributions into both the `AGPL-3.0-only` community edition and separately licensed commercial editions. Large, corporate, ownership-complex, or patent-sensitive submissions may require a separate written agreement before merge.
