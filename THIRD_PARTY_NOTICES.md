# Third-Party Notices

> **Migration preparation, 2026-10-05:** This notice describes the proposed private frontend
> candidate, not an approved public release. It retains existing licenses and attribution;
> it does not establish a new license for third-party software or assets.

Runtime lockfile: `pnpm-lock.yaml`  
Runtime lockfile SHA-256: `aabf7cfef01953b7a8f75c394b3348c38e2640756cd69722893a1e510cf7a48f`  
Runtime dependency roots: 43  
Runtime dependency versions listed: 434

The runtime graph below follows the locked production dependency closure, not all development
dependencies or a final browser-bundle SBOM. It was checked against existing notices and the
already-installed exact versions. Except for the specifically recorded SDK archive check below,
this is not a fresh installation or a verification of every downloaded package integrity.

Rinspace Web incorporates third-party software and assets. Those materials remain governed by
their respective licenses; the repository-wide AGPL license does not replace them.

## SDK license not found: disclosed uncertainty

As of 2026-10-05, we have not found a license covering
`@cloudbase/wx-cloud-client-sdk@1.8.10`. Its versioned registry metadata has no `license`
field, the official npm page displays `none`, and its integrity-matching 32-file npm archive
contains no LICENSE, NOTICE or COPYING file. These are findings about the materials reviewed,
not proof that no license exists or that the SDK is closed-source. We do not label this package
Apache-2.0 by inference from the separate `@cloudbase/js-sdk` package.

Evidence: [exact registry metadata](https://registry.npmjs.org/@cloudbase%2fwx-cloud-client-sdk/1.8.10),
[official npm page](https://www.npmjs.com/package/%40cloudbase/wx-cloud-client-sdk).
The [official integration guide](https://docs.cloudbase.net/quick-start/frameworks/wechat-miniprogram)
instructs users to install this package, but does not supply its license. An
[existing community inquiry about this exact version](https://cnb.cool/tencent/cloud/cloudbase/community/-/issues/1510)
was open and awaiting a human response on the review date; its automated response is not a
license grant.

按维护者决定，本项目如实披露：未找到覆盖该准确版本的许可证。保留现有官方依赖，
不为其补造许可证，不将它重新许可为 Rinspace 自有代码，也不因这一披露事项停止自有
前端源码的迁移准备。使用者和分发者应据此自行评估；这份说明本身不授予 SDK 权利。

The dependency remains declared in the existing manifest and lockfile; its package files and
`node_modules` are not part of the proposed source export. This disclosure does not establish
permission to redistribute the SDK itself or compiled artifacts containing it.

## Release review limits

- The SDK bundles contain a `core-js 3.45.0` banner, with copyright
  © 2014-2025 Denis Pushkarev (zloirock.ru) and a core-js license URL. This is attribution for
  embedded code, not a license for the enclosing SDK. The embedded dependency inventory and
  its required texts must be completed before a release; the locked `core-js-pure@3.49.0`
  entry below is a separate dependency.
- Whole-candidate source, sensitive-content, third-party attribution and asset review,
  a reviewed clean source commit and explicit export approval remain required.
  A generic license text or matching old notice is not a substitute for package-specific
  copyright, NOTICE or additional terms.

## Retained component and asset attribution

The following table is carried verbatim from the existing Rinspace Web legal record.
Its historical `source-snapshot-*` and `git:*` identifiers record that attribution source;
they are not hashes or approval of this candidate. Current path additions are recorded below.
The original upstream component catalog is not included.

| Component | Version | License | Copyright | Source/evidence |
| --- | --- | --- | --- | --- |
| Animate UI-derived Rinspace application components | source-snapshot-d5e83cb83577e0935ebd20665782884de75643cd | LicenseRef-Animate-UI-MIT-Commons-Clause | Copyright (c) 2025 Elliot Sutton; Rinspace modifications copyright (c) 2026 任务优先（上海）网络科技有限责任公司 | `licenses/Animate-UI-MIT-Commons-Clause.txt`<br>`LICENSING.md`<br>`THIRD_PARTY_NOTICES.md` |
| Bootstrap Icons font | 1.13.1 | MIT | Copyright (c) 2019-2024 The Bootstrap Authors | `npm:bootstrap-icons@1.13.1/font/fonts/bootstrap-icons.woff2`<br><https://github.com/twbs/icons/blob/main/LICENSE> |
| Rinspace pre-bootstrap theme runtime | source-snapshot-d5e83cb83577e0935ebd20665782884de75643cd | AGPL-3.0-only | Copyright (c) 2026 任务优先（上海）网络科技有限责任公司 | `Rinspace repository`<br>`LICENSE` |
| Fira Code | Google Fonts snapshot; fontversion 327811 | OFL-1.1 | Copyright 2014-2020 The Fira Code Project Authors | <https://github.com/google/fonts/tree/main/ofl/firacode><br><https://github.com/google/fonts/blob/main/ofl/firacode/OFL.txt> |
| Rinspace generated Google Fonts CSS | source-snapshot-d5e83cb83577e0935ebd20665782884de75643cd | AGPL-3.0-only | Copyright (c) 2026 任务优先（上海）网络科技有限责任公司; font files retain their separate licenses. | `scripts/generate-core-font-css.mjs`<br>`scripts/generate-core-font-css.mjs`<br>`LICENSE`<br>`THIRD_PARTY_NOTICES.md` |
| IBM Plex Mono | Google Fonts snapshot | OFL-1.1 | Copyright IBM Corp. | <https://github.com/google/fonts/tree/main/ofl/ibmplexmono><br><https://github.com/google/fonts/blob/main/ofl/ibmplexmono/OFL.txt> |
| IBM Plex Sans | Google Fonts snapshot; fontversion 209781 | OFL-1.1 | Copyright IBM Corp. | <https://github.com/google/fonts/tree/main/ofl/ibmplexsans><br><https://github.com/google/fonts/blob/main/ofl/ibmplexsans/OFL.txt> |
| JetBrains Mono | Google Fonts snapshot; fontversion 144900 | OFL-1.1 | Copyright 2020 The JetBrains Mono Project Authors | <https://github.com/google/fonts/tree/main/ofl/jetbrainsmono><br><https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt> |
| Newsreader | Google Fonts snapshot; fontversion 65733 | OFL-1.1 | Copyright 2020 The Newsreader Project Authors | <https://github.com/google/fonts/tree/main/ofl/newsreader><br><https://github.com/google/fonts/blob/main/ofl/newsreader/OFL.txt> |
| Noto Sans SC | Google Fonts Simplified Chinese shards | OFL-1.1 | Copyright 2014-2024 Adobe and Google | <https://github.com/google/fonts/tree/main/ofl/notosanssc><br><https://github.com/google/fonts/blob/main/ofl/notosanssc/OFL.txt> |
| Noto Serif SC | Google Fonts Simplified Chinese shards | OFL-1.1 | Copyright 2017-2024 Adobe | <https://github.com/google/fonts/tree/main/ofl/notoserifsc><br><https://github.com/google/fonts/blob/main/ofl/notoserifsc/OFL.txt> |
| Rinspace font library documentation | source-snapshot-d5e83cb83577e0935ebd20665782884de75643cd | AGPL-3.0-only | Copyright (c) 2026 任务优先（上海）网络科技有限责任公司 | `Rinspace repository`<br>`public/fonts/library/README.md`<br>`LICENSE` |
| Rinspace LaTeX starter templates | source-snapshot-d5e83cb83577e0935ebd20665782884de75643cd | CC0-1.0 | Dedicated to the public domain by 任务优先（上海）网络科技有限责任公司 | `templates/latex-article and templates/latex-book via scripts/build-latex-template-archives.mjs`<br>`scripts/build-latex-template-archives.mjs`<br>`templates/latex-article`<br>`templates/latex-book`<br>`ASSET-LICENSES.md` |
| Rinspace LaTeX starter template sources | source-snapshot-d5e83cb83577e0935ebd20665782884de75643cd | CC0-1.0 | Dedicated to the public domain by 任务优先（上海）网络科技有限责任公司 | `Rinspace repository`<br>`ASSET-LICENSES.md` |
| MathJax New Computer Modern web fonts | 4.1.3 | Apache-2.0 | MathJax and upstream New Computer Modern contributors | `npm:@mathjax/mathjax-newcm-font@4.1.3/chtml/woff2`<br>`npm:@mathjax/mathjax-newcm-font@4.1.3`<br><https://github.com/mathjax/MathJax-fonts> |
| Mock Service Worker browser runtime | 2.15.0 | MIT | Copyright (c) 2018–present Artem Zakharchenko | `npm:msw@2.15.0/lib/mockServiceWorker.js`<br><https://github.com/mswjs/msw/blob/v2.15.0/LICENSE.md> |
| PDF.js Worker | 3.11.174 | Apache-2.0 | Mozilla Foundation and PDF.js contributors | `npm:pdfjs-dist@3.11.174/build/pdf.worker.min.js`<br><https://github.com/mozilla/pdf.js> |
| Default profile cover | git:18c7bffd8366a3b69177125f3589cb34e256c487 | CC-BY-4.0 | Copyright (c) 2026 任务优先（上海）网络科技有限责任公司 | `Rinspace repository`<br>`git:18c7bffd8366a3b69177125f3589cb34e256c487`<br>`ASSET-LICENSES.md` |
| Rinspace official brand and site icons | source-snapshot-d5e83cb83577e0935ebd20665782884de75643cd | LicenseRef-Rinspace-Brand-Policy | Copyright (c) 2026 任务优先（上海）网络科技有限责任公司 | `Rinspace brand asset set`<br>`git:3003e45460bb378b52d0dc7a53b290ed75ebd31f`<br>`TRADEMARKS.md`<br>`ASSET-LICENSES.md` |
| Rinspace sticker set | 12-file source snapshot | CC-BY-4.0 | Copyright (c) 2026 任务优先（上海）网络科技有限责任公司 | `Rinspace project asset set`<br>`ASSET-LICENSES.md` |
| Rinspace cultivation and assistant images | source snapshot | CC-BY-4.0 | Copyright (c) 2026 任务优先（上海）网络科技有限责任公司 | `Rinspace project asset set`<br>`ASSET-LICENSES.md` |
| Rinspace site manifest | source snapshot | AGPL-3.0-only | Copyright (c) 2026 任务优先（上海）网络科技有限责任公司 | `Rinspace repository`<br>`scripts/static-package.mjs`<br>`LICENSE` |

## Runtime dependency inventory

425 exact package/version entries match the existing notice; eight changed entries have
package-specific license texts included below. The ninth changed entry is the unresolved SDK.
Copyright lines below are evidence read from installed license files, not a claim that all
required package-specific notices have been fully reviewed or bundled.

| npm package | Version | License metadata | Direct dependency | Copyright evidence | Upstream |
| --- | --- | --- | --- | --- | --- |
| `@babel/helper-string-parser` | `7.29.7` | MIT | no | Copyright (c) 2014-present Sebastian McKenzie and other contributors | <https://babel.dev/docs/en/next/babel-helper-string-parser> |
| `@babel/helper-validator-identifier` | `7.29.7` | MIT | no | Copyright (c) 2014-present Sebastian McKenzie and other contributors | <https://github.com/babel/babel#readme> |
| `@babel/parser` | `7.29.7` | MIT | no | Copyright (C) 2012-2014 by various contributors (see AUTHORS) | <https://babel.dev/docs/en/next/babel-parser> |
| `@babel/runtime` | `7.29.7` | MIT | no | Copyright (c) 2014-present Sebastian McKenzie and other contributors | <https://babel.dev/docs/en/next/babel-runtime> |
| `@babel/types` | `7.29.7` | MIT | no | Copyright (c) 2014-present Sebastian McKenzie and other contributors | <https://babel.dev/docs/en/next/babel-types> |
| `@cloudbase/adapter-interface` | `0.7.1` | ISC | no | See exact package archive; attribution review pending | — |
| `@cloudbase/adapter-wx_mp` | `1.3.1` | ISC | no | See exact package archive; attribution review pending | — |
| `@cloudbase/js-sdk` | `3.8.0` | Apache-2.0 | yes |          2. Grant of Copyright License. Subject to the terms and conditions of<br>         Copyright (c) 2018-present Tencent Ltd. All rights reserved. | <https://www.npmjs.com/package/@cloudbase/js-sdk/v/3.8.0> |
| `@cloudbase/wx-cloud-client-sdk` | `1.8.10` | Not declared; license not found | no | See disclosed uncertainty above; no SDK license inferred | <https://www.npmjs.com/package/@cloudbase/wx-cloud-client-sdk/v/1.8.10> |
| `@codemirror/autocomplete` | `6.20.3` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `@codemirror/commands` | `6.10.3` | MIT | yes | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/commands#readme> |
| `@codemirror/lang-angular` | `0.1.4` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-angular#readme> |
| `@codemirror/lang-cpp` | `6.0.3` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-cpp#readme> |
| `@codemirror/lang-css` | `6.3.1` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-css#readme> |
| `@codemirror/lang-go` | `6.0.1` | MIT | no | Copyright (C) 2024 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-go#readme> |
| `@codemirror/lang-html` | `6.4.11` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-html#readme> |
| `@codemirror/lang-java` | `6.0.2` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-java#readme> |
| `@codemirror/lang-javascript` | `6.2.5` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-javascript#readme> |
| `@codemirror/lang-jinja` | `6.0.1` | MIT | no | Copyright (C) 2025 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `@codemirror/lang-json` | `6.0.2` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-json#readme> |
| `@codemirror/lang-less` | `6.0.2` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-less#readme> |
| `@codemirror/lang-liquid` | `6.3.2` | MIT | no | Copyright (C) 2018-2023 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-liquid#readme> |
| `@codemirror/lang-markdown` | `6.5.0` | MIT | yes | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-markdown#readme> |
| `@codemirror/lang-php` | `6.0.2` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-php#readme> |
| `@codemirror/lang-python` | `6.2.1` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-python#readme> |
| `@codemirror/lang-rust` | `6.0.2` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-rust#readme> |
| `@codemirror/lang-sass` | `6.0.2` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-sass#readme> |
| `@codemirror/lang-sql` | `6.10.0` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-sql#readme> |
| `@codemirror/lang-vue` | `0.1.3` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-vue#readme> |
| `@codemirror/lang-wast` | `6.0.2` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-wast#readme> |
| `@codemirror/lang-xml` | `6.1.0` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-xml#readme> |
| `@codemirror/lang-yaml` | `6.1.3` | MIT | no | Copyright (C) 2024 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/lang-yaml#readme> |
| `@codemirror/language` | `6.12.3` | MIT | yes | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/language#readme> |
| `@codemirror/language-data` | `6.5.2` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/language-data#readme> |
| `@codemirror/legacy-modes` | `6.5.3` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `@codemirror/lint` | `6.9.7` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `@codemirror/search` | `6.7.1` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `@codemirror/state` | `6.6.0` | MIT | yes | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/state#readme> |
| `@codemirror/theme-one-dark` | `6.1.3` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/theme-one-dark#readme> |
| `@codemirror/view` | `6.43.1` | MIT | yes | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `@floating-ui/core` | `1.8.0` | MIT | no | Copyright (c) 2021-present Floating UI contributors | <https://floating-ui.com> |
| `@floating-ui/dom` | `1.8.0` | MIT | no | Copyright (c) 2021-present Floating UI contributors | <https://floating-ui.com> |
| `@floating-ui/react-dom` | `2.1.9` | MIT | no | Copyright (c) 2021-present Floating UI contributors | <https://floating-ui.com/docs/react-dom> |
| `@floating-ui/utils` | `0.2.12` | MIT | no | Copyright (c) 2021-present Floating UI contributors | <https://floating-ui.com> |
| `@jridgewell/sourcemap-codec` | `1.5.5` | MIT | no | Copyright 2024 Justin Ridgewell <justin@ridgewell.name> | <https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec> |
| `@lezer/common` | `1.5.2` | MIT | no | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/common#readme> |
| `@lezer/cpp` | `1.1.6` | MIT | no | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `@lezer/css` | `1.3.3` | MIT | no | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/css#readme> |
| `@lezer/go` | `1.0.1` | MIT | no | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/go#readme> |
| `@lezer/highlight` | `1.2.3` | MIT | yes | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/highlight#readme> |
| `@lezer/html` | `1.3.13` | MIT | no | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/html#readme> |
| `@lezer/java` | `1.1.3` | MIT | no | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/java#readme> |
| `@lezer/javascript` | `1.5.4` | MIT | no | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/javascript#readme> |
| `@lezer/json` | `1.0.3` | MIT | no | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin>, Arun Srinivasan <rulfzid@gmail.com>, and others | <https://github.com/lezer-parser/json#readme> |
| `@lezer/lr` | `1.4.10` | MIT | no | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `@lezer/markdown` | `1.6.4` | MIT | no | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `@lezer/php` | `1.0.5` | MIT | no | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/php#readme> |
| `@lezer/python` | `1.1.19` | MIT | no | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `@lezer/rust` | `1.0.2` | MIT | no | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/rust#readme> |
| `@lezer/sass` | `1.1.0` | MIT | no | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/sass#readme> |
| `@lezer/xml` | `1.0.6` | MIT | no | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/lezer-parser/xml#readme> |
| `@lezer/yaml` | `1.0.4` | MIT | no | Copyright (C) 2024 by Marijn Haverbeke <marijnh@gmail.com> and others | <https://github.com/lezer-parser/yaml#readme> |
| `@mapbox/node-pre-gyp` | `1.0.11` | BSD-3-Clause | no | Copyright (c), Mapbox | <https://github.com/mapbox/node-pre-gyp#readme> |
| `@marijn/find-cluster-break` | `1.0.2` | MIT | no | Copyright (C) 2024 by Marijn Haverbeke <marijn@haverbeke.berlin> | <https://github.com/marijnh/find-cluster-break#readme> |
| `@mathjax/mathjax-newcm-font` | `4.1.3` | Apache-2.0 | yes | See exact package archive; attribution review pending | <https://github.com/mathjax/MathJax-fonts#readme> |
| `@mathjax/src` | `4.1.3` | Apache-2.0 | yes |    2. Grant of Copyright License. Subject to the terms and conditions of<br>   Copyright [yyyy] [name of copyright owner] | <https://github.com/mathjax/Mathjax-src#readme> |
| `@mattiasbuelens/web-streams-adapter` | `0.1.0` | MIT | no | Copyright (c) 2018 Mattias Buelens | <https://www.npmjs.com/package/@mattiasbuelens/web-streams-adapter/v/0.1.0> |
| `@milkdown/components` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/core` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/crepe` | `7.22.2` | MIT | yes | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/ctx` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/exception` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/kit` | `7.22.2` | MIT | yes | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-block` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-clipboard` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-cursor` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-diff` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-history` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-indent` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-listener` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-slash` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-streaming` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-tooltip` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-trailing` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/plugin-upload` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/preset-commonmark` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/preset-gfm` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/prose` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/transformer` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@milkdown/utils` | `7.22.2` | MIT | no | Copyright (c) 2020-present Mirone | <https://github.com/Milkdown/milkdown#readme> |
| `@ocavue/utils` | `1.7.0` | MIT | no | Copyright (c) 2025 ocavue | <https://github.com/ocavue/utils#readme> |
| `@radix-ui/number` | `1.1.1` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/primitive` | `1.1.3` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/primitive` | `1.1.7` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-accordion` | `1.2.12` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-arrow` | `1.1.15` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-arrow` | `1.1.7` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-checkbox` | `1.3.3` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-collapsible` | `1.1.12` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-collection` | `1.1.7` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-compose-refs` | `1.1.2` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/react-compose-refs` | `1.1.5` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-context` | `1.1.2` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/react-context` | `1.2.2` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-dialog` | `1.1.15` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-direction` | `1.1.1` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/react-dismissable-layer` | `1.1.11` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-dismissable-layer` | `1.1.19` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-dropdown-menu` | `2.1.16` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-focus-guards` | `1.1.3` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-focus-scope` | `1.1.7` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-hover-card` | `1.1.23` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-id` | `1.1.1` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/react-label` | `2.1.8` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-menu` | `2.1.16` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-popover` | `1.1.15` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-popper` | `1.2.8` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-popper` | `1.3.7` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-portal` | `1.1.17` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-portal` | `1.1.9` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-presence` | `1.1.10` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-presence` | `1.1.5` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-primitive` | `2.1.10` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-primitive` | `2.1.3` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-primitive` | `2.1.4` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-roving-focus` | `1.1.11` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-select` | `2.2.6` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-slot` | `1.2.3` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-slot` | `1.2.4` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-slot` | `1.3.3` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-switch` | `1.2.6` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-tabs` | `1.1.13` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-toast` | `1.2.15` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-tooltip` | `1.2.8` | MIT | yes | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-callback-ref` | `1.1.1` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-callback-ref` | `1.1.4` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-controllable-state` | `1.2.2` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-controllable-state` | `1.2.6` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-effect-event` | `0.0.2` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-effect-event` | `0.0.5` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-escape-keydown` | `1.1.1` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-layout-effect` | `1.1.1` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-layout-effect` | `1.1.4` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-previous` | `1.1.1` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-rect` | `1.1.1` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-rect` | `1.1.4` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-size` | `1.1.1` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/react-use-size` | `1.1.4` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/react-visually-hidden` | `1.2.3` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@radix-ui/rect` | `1.1.1` | MIT | no | See exact package archive; attribution review pending | <https://radix-ui.com/primitives> |
| `@radix-ui/rect` | `1.1.3` | MIT | no | Copyright (c) 2022 WorkOS | <https://radix-ui.com/primitives> |
| `@rinspacehq/markdown-writer` | `0.3.4` | MIT | yes | Copyright (c) 2026 Rinspace contributors | <https://github.com/rinspacehq/rinspace-editor-markdown/releases/tag/v0.3.4> |
| `@shikijs/core` | `4.3.1` | MIT | no | Copyright (c) 2021 Pine Wu<br>Copyright (c) 2023 Anthony Fu <https://github.com/antfu> | <https://github.com/shikijs/shiki#readme> |
| `@shikijs/engine-javascript` | `4.3.1` | MIT | no | Copyright (c) 2021 Pine Wu<br>Copyright (c) 2023 Anthony Fu <https://github.com/antfu> | <https://github.com/shikijs/shiki#readme> |
| `@shikijs/engine-oniguruma` | `4.3.1` | MIT | no | Copyright (c) 2021 Pine Wu<br>Copyright (c) 2023 Anthony Fu <https://github.com/antfu> | <https://github.com/shikijs/shiki#readme> |
| `@shikijs/langs` | `4.3.1` | MIT | no | Copyright (c) 2021 Pine Wu<br>Copyright (c) 2023 Anthony Fu <https://github.com/antfu> | <https://github.com/shikijs/shiki#readme> |
| `@shikijs/primitive` | `4.3.1` | MIT | no | Copyright (c) 2021 Pine Wu<br>Copyright (c) 2023 Anthony Fu <https://github.com/antfu> | <https://github.com/shikijs/shiki#readme> |
| `@shikijs/themes` | `4.3.1` | MIT | no | Copyright (c) 2021 Pine Wu<br>Copyright (c) 2023 Anthony Fu <https://github.com/antfu> | <https://github.com/shikijs/shiki#readme> |
| `@shikijs/types` | `4.3.1` | MIT | no | Copyright (c) 2021 Pine Wu<br>Copyright (c) 2023 Anthony Fu <https://github.com/antfu> | <https://github.com/shikijs/shiki#readme> |
| `@shikijs/vscode-textmate` | `10.0.2` | MIT | no | Copyright (c) Microsoft Corporation | <https://github.com/shikijs/vscode-textmate#readme> |
| `@types/debug` | `4.1.13` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/debug> |
| `@types/hast` | `3.0.5` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/hast> |
| `@types/katex` | `0.16.8` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/katex> |
| `@types/lodash` | `4.17.24` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/lodash> |
| `@types/lodash-es` | `4.17.12` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/lodash-es> |
| `@types/mdast` | `4.0.4` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/mdast> |
| `@types/ms` | `2.1.0` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/ms> |
| `@types/react` | `19.2.18` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react> |
| `@types/react-dom` | `19.2.4` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom> |
| `@types/trusted-types` | `2.0.7` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/trusted-types> |
| `@types/unist` | `3.0.3` | MIT | no |     Copyright (c) Microsoft Corporation. | <https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/unist> |
| `@ungap/structured-clone` | `1.3.1` | ISC | no | Copyright (c) 2021, Andrea Giammarchi, @WebReflection | <https://github.com/ungap/structured-clone#readme> |
| `@vue/compiler-core` | `3.5.39` | MIT | no | Copyright (c) 2018-present, Yuxi (Evan) You | <https://github.com/vuejs/core/tree/main/packages/compiler-core#readme> |
| `@vue/compiler-dom` | `3.5.39` | MIT | no | Copyright (c) 2018-present, Yuxi (Evan) You | <https://github.com/vuejs/core/tree/main/packages/compiler-dom#readme> |
| `@vue/compiler-sfc` | `3.5.39` | MIT | no | Copyright (c) 2018-present, Yuxi (Evan) You | <https://github.com/vuejs/core/tree/main/packages/compiler-sfc#readme> |
| `@vue/compiler-ssr` | `3.5.39` | MIT | no | Copyright (c) 2018-present, Yuxi (Evan) You | <https://github.com/vuejs/core/tree/main/packages/compiler-ssr#readme> |
| `@vue/reactivity` | `3.5.39` | MIT | no | Copyright (c) 2018-present, Yuxi (Evan) You | <https://github.com/vuejs/core/tree/main/packages/reactivity#readme> |
| `@vue/runtime-core` | `3.5.39` | MIT | no | Copyright (c) 2018-present, Yuxi (Evan) You | <https://github.com/vuejs/core/tree/main/packages/runtime-core#readme> |
| `@vue/runtime-dom` | `3.5.39` | MIT | no | Copyright (c) 2018-present, Yuxi (Evan) You | <https://github.com/vuejs/core/tree/main/packages/runtime-dom#readme> |
| `@vue/server-renderer` | `3.5.39` | MIT | no | Copyright (c) 2018-present, Yuxi (Evan) You | <https://github.com/vuejs/core/tree/main/packages/server-renderer#readme> |
| `@vue/shared` | `3.5.39` | MIT | no | Copyright (c) 2018-present, Yuxi (Evan) You | <https://github.com/vuejs/core/tree/main/packages/shared#readme> |
| `@xmldom/xmldom` | `0.9.10` | MIT | no | Copyright 2019 - present Christopher J. Brody and other contributors, as listed in: https://github.com/xmldom/xmldom/graphs/contributors<br>Copyright 2012 - 2017 @jindw <jindw@xidea.org> and other contributors, as listed in: https://github.com/jindw/xmldom/graphs/contributors | <https://github.com/xmldom/xmldom> |
| `abbrev` | `1.1.1` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors<br>Copyright Isaac Z. Schlueter and Contributors | <https://github.com/isaacs/abbrev-js#readme> |
| `agent-base` | `6.0.2` | MIT | no | See exact package archive; attribution review pending | <https://github.com/TooTallNate/node-agent-base#readme> |
| `ansi-regex` | `5.0.1` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) | <https://github.com/chalk/ansi-regex#readme> |
| `aproba` | `2.1.0` | ISC | no | Copyright (c) 2015, Rebecca Turner <me@re-becca.org> | <https://github.com/iarna/aproba> |
| `are-we-there-yet` | `2.0.0` | ISC | no | Copyright npm, Inc. | <https://github.com/npm/are-we-there-yet> |
| `aria-hidden` | `1.2.6` | MIT | no | Copyright (c) 2017 Anton Korzunov | <https://github.com/theKashey/aria-hidden#readme> |
| `bail` | `2.0.2` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/bail#readme> |
| `balanced-match` | `1.0.2` | MIT | no | Copyright (c) 2013 Julian Gruber &lt;julian@juliangruber.com&gt; | <https://github.com/juliangruber/balanced-match#readme> |
| `balanced-match` | `4.0.4` | MIT | no | Original code Copyright Julian Gruber <julian@juliangruber.com><br>Port to TypeScript Copyright Isaac Z. Schlueter <i@izs.me> | <https://github.com/juliangruber/balanced-match#readme> |
| `brace-expansion` | `1.1.15` | MIT | no | Copyright (c) 2013 Julian Gruber <julian@juliangruber.com> | <https://github.com/juliangruber/brace-expansion#readme> |
| `brace-expansion` | `5.0.9` | MIT | no | Copyright Julian Gruber <julian@juliangruber.com><br>TypeScript port Copyright Isaac Z. Schlueter <i@izs.me> | <https://github.com/juliangruber/brace-expansion#readme> |
| `bson` | `6.10.4` | Apache-2.0 | no |    2. Grant of Copyright License. Subject to the terms and conditions of<br>   Copyright [yyyy] [name of copyright owner] | <https://www.npmjs.com/package/bson/v/6.10.4> |
| `canvas` | `2.11.2` | MIT | no | See exact package archive; attribution review pending | <https://github.com/Automattic/node-canvas> |
| `ccount` | `2.0.1` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/ccount#readme> |
| `character-entities` | `2.0.2` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/character-entities#readme> |
| `character-entities-html4` | `2.1.0` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/character-entities-html4#readme> |
| `character-entities-legacy` | `3.0.0` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/character-entities-legacy#readme> |
| `chownr` | `2.0.0` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/isaacs/chownr#readme> |
| `classnames` | `2.5.1` | MIT | yes | Copyright (c) 2018 Jed Watson | <https://github.com/JedWatson/classnames#readme> |
| `clsx` | `2.1.1` | MIT | yes | Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com) | <https://github.com/lukeed/clsx#readme> |
| `codemirror` | `6.0.2` | MIT | no | Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/codemirror/basic-setup#readme> |
| `color-support` | `1.1.3` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/isaacs/color-support#readme> |
| `comma-separated-tokens` | `2.0.3` | MIT | no | Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/comma-separated-tokens#readme> |
| `commander` | `14.0.3` | MIT | no | Copyright (c) 2011 TJ Holowaychuk <tj@vision-media.ca> | <https://github.com/tj/commander.js#readme> |
| `commander` | `15.0.0` | MIT | no | Copyright (c) 2011 TJ Holowaychuk <tj@vision-media.ca> | <https://github.com/tj/commander.js#readme> |
| `concat-map` | `0.0.1` | MIT | no | See exact package archive; attribution review pending | <https://github.com/substack/node-concat-map#readme> |
| `console-control-strings` | `1.1.0` | ISC | no | Copyright (c) 2014, Rebecca Turner <me@re-becca.org> | <https://github.com/iarna/console-control-strings#readme> |
| `cookie` | `1.1.1` | MIT | no | Copyright (c) 2012-2014 Roman Shtylman <shtylman@gmail.com><br>Copyright (c) 2015 Douglas Christopher Wilson <doug@somethingdoug.com> | <https://github.com/jshttp/cookie#readme> |
| `core-js-pure` | `3.49.0` | MIT | no | Copyright (c) 2013–2025 Denis Pushkarev (zloirock.ru)<br>Copyright (c) 2025–2026 CoreJS Company (core-js.io) | <https://www.npmjs.com/package/core-js-pure/v/3.49.0> |
| `crelt` | `1.0.6` | MIT | no | Copyright (C) 2020 by Marijn Haverbeke <marijn@haverbeke.berlin> | <https://github.com/marijnh/crelt#readme> |
| `csstype` | `3.2.3` | MIT | no | Copyright (c) 2017-2018 Fredrik Nicol | <https://github.com/frenic/csstype#readme> |
| `debug` | `4.4.3` | MIT | no | Copyright (c) 2014-2017 TJ Holowaychuk <tj@vision-media.ca><br>Copyright (c) 2018-2021 Josh Junon | <https://github.com/debug-js/debug#readme> |
| `decode-named-character-reference` | `1.3.0` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/decode-named-character-reference#readme> |
| `decompress-response` | `4.2.1` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) | <https://github.com/sindresorhus/decompress-response#readme> |
| `delegates` | `1.0.0` | MIT | no | Copyright (c) 2015 TJ Holowaychuk <tj@vision-media.ca> | <https://github.com/visionmedia/node-delegates#readme> |
| `dequal` | `2.0.3` | MIT | no | Copyright (c) Luke Edwards <luke.edwards05@gmail.com> (lukeed.com) | <https://github.com/lukeed/dequal#readme> |
| `detect-libc` | `2.1.2` | Apache-2.0 | no |    2. Grant of Copyright License. Subject to the terms and conditions of<br>   Copyright {yyyy} {name of copyright owner} | <https://github.com/lovell/detect-libc#readme> |
| `detect-node-es` | `1.1.0` | MIT | no | Copyright (c) 2017 Ilya Kantor | <https://github.com/thekashey/detect-node> |
| `devlop` | `1.1.0` | MIT | no | Copyright (c) 2023 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/devlop#readme> |
| `dompurify` | `3.4.11` | (MPL-2.0 OR Apache-2.0) | yes |    2. Grant of Copyright License. Subject to the terms and conditions of<br>   Copyright [yyyy] [name of copyright owner] | <https://github.com/cure53/DOMPurify> |
| `emoji-regex` | `8.0.0` | MIT | no | See exact package archive; attribution review pending | <https://mths.be/emoji-regex> |
| `entities` | `7.0.1` | BSD-2-Clause | no | Copyright (c) Felix Böhm | <https://github.com/fb55/entities#readme> |
| `escape-string-regexp` | `5.0.0` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com) | <https://github.com/sindresorhus/escape-string-regexp#readme> |
| `estree-walker` | `2.0.2` | MIT | no | Copyright (c) 2015-20 [these people](https://github.com/Rich-Harris/estree-walker/graphs/contributors) | <https://github.com/Rich-Harris/estree-walker#readme> |
| `extend` | `3.0.2` | MIT | no | Copyright (c) 2014 Stefan Thomas | <https://github.com/justmoon/node-extend#readme> |
| `framer-motion` | `12.43.0` | MIT | no | Copyright (c) 2018 Framer B.V. | <https://github.com/motiondivision/motion#readme> |
| `fs-minipass` | `2.1.0` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/npm/fs-minipass#readme> |
| `fs.realpath` | `1.0.0` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors<br>  Copyright Joyent, Inc. and other Node contributors. | <https://github.com/isaacs/fs.realpath#readme> |
| `gauge` | `3.0.2` | ISC | no | Copyright (c) 2014, Rebecca Turner <me@re-becca.org> | <https://github.com/npm/gauge> |
| `get-nonce` | `1.0.1` | MIT | no | Copyright (c) 2020 Anton Korzunov | <https://github.com/theKashey/get-nonce> |
| `glob` | `13.0.6` | BlueOak-1.0.0 | no | See exact package archive; attribution review pending | <https://github.com/isaacs/node-glob#readme> |
| `glob` | `7.2.3` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/isaacs/node-glob#readme> |
| `has-unicode` | `2.0.1` | ISC | no | Copyright (c) 2014, Rebecca Turner <me@re-becca.org> | <https://github.com/iarna/has-unicode> |
| `hast-util-to-html` | `9.0.5` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/hast-util-to-html#readme> |
| `hast-util-whitespace` | `3.0.0` | MIT | no | Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/hast-util-whitespace#readme> |
| `html-parse-stringify` | `3.1.0` | MIT | no | Copyright (c) 2025 Henrik Joreteg <henrik@joreteg.com> | <https://github.com/henrikjoreteg/html-parse-stringify> |
| `html-void-elements` | `3.0.0` | MIT | no | Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/html-void-elements#readme> |
| `https-proxy-agent` | `5.0.1` | MIT | no | See exact package archive; attribution review pending | <https://github.com/TooTallNate/node-https-proxy-agent#readme> |
| `i18next` | `25.5.2` | MIT | yes | Copyright (c) 2025 i18next | <https://www.i18next.com> |
| `immer` | `9.0.21` | MIT | no | Copyright (c) 2017 Michel Weststrate | <https://github.com/immerjs/immer#readme> |
| `inflight` | `1.0.6` | ISC | no | Copyright (c) Isaac Z. Schlueter | <https://github.com/isaacs/inflight> |
| `inherits` | `2.0.4` | ISC | no | Copyright (c) Isaac Z. Schlueter | <https://github.com/isaacs/inherits#readme> |
| `invariant` | `2.2.4` | MIT | no | Copyright (c) 2013-present, Facebook, Inc. | <https://github.com/zertosh/invariant#readme> |
| `is-fullwidth-code-point` | `3.0.0` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) | <https://github.com/sindresorhus/is-fullwidth-code-point#readme> |
| `is-plain-obj` | `4.1.0` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com) | <https://github.com/sindresorhus/is-plain-obj#readme> |
| `js-tokens` | `4.0.0` | MIT | no | Copyright (c) 2014, 2015, 2016, 2017, 2018 Simon Lydell | <https://github.com/lydell/js-tokens#readme> |
| `jwt-decode` | `3.1.2` | MIT | no | Copyright (c) 2015 Auth0, Inc. <support@auth0.com> (http://auth0.com) | <https://github.com/auth0/jwt-decode#readme> |
| `katex` | `0.19.0` | MIT | yes | Copyright (c) 2013-2020 Khan Academy and other contributors | <https://katex.org> |
| `lodash` | `4.18.1` | MIT | no | Copyright OpenJS Foundation and other contributors <https://openjsf.org/><br>Copyright and related rights for sample code are waived via CC0. Sample | <https://www.npmjs.com/package/lodash/v/4.18.1> |
| `lodash-es` | `4.18.1` | MIT | no | Copyright OpenJS Foundation and other contributors <https://openjsf.org/><br>Copyright and related rights for sample code are waived via CC0. Sample | <https://lodash.com/custom-builds> |
| `longest-streak` | `3.1.0` | MIT | no | Copyright (c) 2015 Titus Wormer <mailto:tituswormer@gmail.com> | <https://github.com/wooorm/longest-streak#readme> |
| `loose-envify` | `1.4.0` | MIT | no | Copyright (c) 2015 Andres Suarez <zertosh@gmail.com> | <https://github.com/zertosh/loose-envify> |
| `lru-cache` | `11.5.2` | BlueOak-1.0.0 | no | See exact package archive; attribution review pending | <https://github.com/isaacs/node-lru-cache#readme> |
| `lucide-react` | `1.31.0` | ISC | yes | Copyright (c) 2026 Lucide Icons and Contributors<br>Copyright (c) 2013-present Cole Bemis | <https://lucide.dev> |
| `magic-string` | `0.30.21` | MIT | no | Copyright 2018 Rich Harris | <https://github.com/Rich-Harris/magic-string#readme> |
| `make-dir` | `3.1.0` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) | <https://github.com/sindresorhus/make-dir#readme> |
| `markdown-table` | `3.0.4` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/markdown-table#readme> |
| `mdast-util-definitions` | `6.0.0` | MIT | no | Copyright (c) 2015-2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-definitions#readme> |
| `mdast-util-find-and-replace` | `3.0.2` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-find-and-replace#readme> |
| `mdast-util-from-markdown` | `2.0.3` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-from-markdown#readme> |
| `mdast-util-gfm` | `3.1.0` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-gfm#readme> |
| `mdast-util-gfm-autolink-literal` | `2.0.1` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-gfm-autolink-literal#readme> |
| `mdast-util-gfm-footnote` | `2.1.0` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-gfm-footnote#readme> |
| `mdast-util-gfm-strikethrough` | `2.0.0` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-gfm-strikethrough#readme> |
| `mdast-util-gfm-table` | `2.0.0` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-gfm-table#readme> |
| `mdast-util-gfm-task-list-item` | `2.0.0` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-gfm-task-list-item#readme> |
| `mdast-util-math` | `3.0.0` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-math#readme> |
| `mdast-util-phrasing` | `4.1.0` | MIT | no | Copyright (c) 2017 Titus Wormer <tituswormer@gmail.com><br>Copyright (c) 2017 Victor Felder <victor@draft.li> | <https://github.com/syntax-tree/mdast-util-phrasing#readme> |
| `mdast-util-to-hast` | `13.2.1` | MIT | no | Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-to-hast#readme> |
| `mdast-util-to-markdown` | `2.1.2` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-to-markdown#readme> |
| `mdast-util-to-string` | `4.0.0` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/mdast-util-to-string#readme> |
| `mhchemparser` | `4.2.1` | Apache-2.0 | no |    2. Grant of Copyright License. Subject to the terms and conditions of<br>   Copyright {yyyy} {name of copyright owner} | <https://github.com/mhchem/mhchemParser> |
| `micromark` | `4.0.2` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-core-commonmark` | `2.0.3` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-extension-gfm` | `3.0.0` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark-extension-gfm#readme> |
| `micromark-extension-gfm-autolink-literal` | `2.1.0` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark-extension-gfm-autolink-literal#readme> |
| `micromark-extension-gfm-footnote` | `2.1.0` | MIT | no | Copyright (c) 2021 Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark-extension-gfm-footnote#readme> |
| `micromark-extension-gfm-strikethrough` | `2.1.0` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark-extension-gfm-strikethrough#readme> |
| `micromark-extension-gfm-table` | `2.1.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark-extension-gfm-table#readme> |
| `micromark-extension-gfm-tagfilter` | `2.0.0` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark-extension-gfm-tagfilter#readme> |
| `micromark-extension-gfm-task-list-item` | `2.1.0` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark-extension-gfm-task-list-item#readme> |
| `micromark-extension-math` | `3.1.0` | MIT | no | Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark-extension-math#readme> |
| `micromark-factory-destination` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-factory-label` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-factory-space` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-factory-title` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-factory-whitespace` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-character` | `2.1.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-chunked` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-classify-character` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-combine-extensions` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-decode-numeric-character-reference` | `2.0.2` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-decode-string` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-encode` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-html-tag-name` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-normalize-identifier` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-resolve-all` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-sanitize-uri` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-subtokenize` | `2.1.0` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-symbol` | `2.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `micromark-util-types` | `2.0.2` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/micromark/micromark/tree/main#readme> |
| `mimic-response` | `2.1.0` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com) | <https://github.com/sindresorhus/mimic-response#readme> |
| `minimatch` | `10.2.6` | BlueOak-1.0.0 | no | See exact package archive; attribution review pending | <https://github.com/isaacs/minimatch#readme> |
| `minimatch` | `3.1.5` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/isaacs/minimatch#readme> |
| `minipass` | `3.3.6` | ISC | no | Copyright (c) 2017-2022 npm, Inc., Isaac Z. Schlueter, and Contributors | <https://github.com/isaacs/minipass#readme> |
| `minipass` | `5.0.0` | ISC | no | Copyright (c) 2017-2023 npm, Inc., Isaac Z. Schlueter, and Contributors | <https://github.com/isaacs/minipass#readme> |
| `minipass` | `7.1.3` | BlueOak-1.0.0 | no | See exact package archive; attribution review pending | <https://github.com/isaacs/minipass#readme> |
| `minizlib` | `2.1.2` | MIT | no | Copyright Isaac Z. Schlueter and Contributors<br>Copyright Node.js contributors. All rights reserved.<br>Copyright Joyent, Inc. and other Node contributors. All rights reserved. | <https://github.com/isaacs/minizlib#readme> |
| `mj-context-menu` | `1.0.0` | Apache-2.0 | no |    2. Grant of Copyright License. Subject to the terms and conditions of<br>   Copyright [yyyy] [name of copyright owner] | <https://github.com/zorkow/context-menu> |
| `mkdirp` | `1.0.4` | MIT | no | Copyright James Halliday (mail@substack.net) and Isaac Z. Schlueter (i@izs.me) | <https://github.com/isaacs/node-mkdirp#readme> |
| `motion` | `12.43.0` | MIT | yes | Copyright (c) 2024 [Motion](https://motion.dev) B.V. | <https://github.com/motiondivision/motion#readme> |
| `motion-dom` | `12.43.0` | MIT | no | Copyright (c) 2024 [Motion](https://motion.dev) B.V. | <https://github.com/motiondivision/motion#readme> |
| `motion-utils` | `12.39.0` | MIT | no | Copyright (c) 2024 [Motion](https://motion.dev) B.V. | <https://github.com/motiondivision/motion#readme> |
| `ms` | `2.1.3` | MIT | no | Copyright (c) 2020 Vercel, Inc. | <https://github.com/vercel/ms#readme> |
| `nan` | `2.28.0` | MIT | no | Copyright (c) 2018 [NAN contributors](<https://github.com/nodejs/nan#wg-members--collaborators>) | <https://github.com/nodejs/nan#readme> |
| `nanoid` | `3.3.12` | MIT | no | Copyright 2017 Andrey Sitnik <andrey@sitnik.ru> | <https://github.com/ai/nanoid#readme> |
| `nanoid` | `6.0.2` | MIT | no | Copyright 2017 Andrey Sitnik <andrey@sitnik.es> | <https://github.com/ai/nanoid#readme> |
| `node-fetch` | `2.7.0` | MIT | no | Copyright (c) 2016 David Frank | <https://github.com/bitinn/node-fetch> |
| `nopt` | `5.0.0` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/npm/nopt#readme> |
| `normalize-wheel` | `1.0.1` | BSD-3-Clause | no | Copyright (c) 2015, Facebook, Inc. All rights reserved. | — |
| `npmlog` | `5.0.1` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/npm/npmlog#readme> |
| `object-assign` | `4.1.1` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) | <https://github.com/sindresorhus/object-assign#readme> |
| `once` | `1.4.0` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/isaacs/once#readme> |
| `oniguruma-parser` | `0.12.2` | MIT | no | Copyright (c) 2025-2026 Steven Levithan | <https://github.com/slevithan/oniguruma-parser#readme> |
| `oniguruma-to-es` | `4.3.6` | MIT | no | Copyright (c) 2024-2026 Steven Levithan | <https://github.com/slevithan/oniguruma-to-es#readme> |
| `orderedmap` | `2.1.1` | MIT | no | Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/marijnh/orderedmap#readme> |
| `package-json-from-dist` | `1.0.1` | BlueOak-1.0.0 | no | See exact package archive; attribution review pending | <https://github.com/isaacs/package-json-from-dist#readme> |
| `path-is-absolute` | `1.0.1` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) | <https://github.com/sindresorhus/path-is-absolute#readme> |
| `path-scurry` | `2.0.2` | BlueOak-1.0.0 | no | See exact package archive; attribution review pending | <https://github.com/isaacs/path-scurry#readme> |
| `path2d-polyfill` | `2.0.1` | MIT | no | Copyright (c) 2018 Anders Nilsson | <https://github.com/nilzona/path2d-polyfill#readme> |
| `pdfjs-dist` | `3.11.174` | Apache-2.0 | yes |    2. Grant of Copyright License. Subject to the terms and conditions of | <http://mozilla.github.io/pdf.js/> |
| `picocolors` | `1.1.1` | ISC | no | Copyright (c) 2021-2024 Oleksii Raspopov, Kostiantyn Denysov, Anton Verinov | <https://github.com/alexeyraspopov/picocolors#readme> |
| `postcss` | `8.5.15` | MIT | no | Copyright 2013 Andrey Sitnik <andrey@sitnik.es> | <https://postcss.org/> |
| `property-information` | `7.2.0` | MIT | no | Copyright (c) Titus Wormer <mailto:tituswormer@gmail.com> | <https://github.com/wooorm/property-information#readme> |
| `prosemirror-changeset` | `2.4.1` | MIT | no | Copyright (C) 2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `prosemirror-commands` | `1.7.1` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/prosemirror/prosemirror-commands#readme> |
| `prosemirror-drop-indicator` | `0.1.4` | MIT | no | Copyright (c) 2025 ocavue | <https://github.com/prosekit/prosemirror-drop-indicator#readme> |
| `prosemirror-dropcursor` | `1.8.3` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `prosemirror-gapcursor` | `1.4.1` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/prosemirror/prosemirror-gapcursor#readme> |
| `prosemirror-history` | `1.5.0` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/prosemirror/prosemirror-history#readme> |
| `prosemirror-inputrules` | `1.5.1` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/prosemirror/prosemirror-inputrules#readme> |
| `prosemirror-keymap` | `1.2.3` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/prosemirror/prosemirror-keymap#readme> |
| `prosemirror-model` | `1.25.10` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `prosemirror-safari-ime-span` | `1.0.2` | MIT | no | Copyright (c) 2024 ocavue | <https://github.com/ocavue/prosemirror-safari-ime-span#readme> |
| `prosemirror-schema-list` | `1.5.1` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/prosemirror/prosemirror-schema-list#readme> |
| `prosemirror-state` | `1.4.4` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/prosemirror/prosemirror-state#readme> |
| `prosemirror-tables` | `1.8.5` | MIT | no | Copyright (C) 2015-2016 by Marijn Haverbeke <marijnh@gmail.com> and others | <https://github.com/ProseMirror/prosemirror-tables#readme> |
| `prosemirror-transform` | `1.12.0` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/prosemirror/prosemirror-transform#readme> |
| `prosemirror-view` | `1.42.0` | MIT | no | Copyright (C) 2015-2017 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | — |
| `prosemirror-virtual-cursor` | `0.4.2` | MIT | no | Copyright (c) 2022 ocavue | <https://github.com/ocavue/prosemirror-virtual-cursor#readme> |
| `react` | `19.2.8` | MIT | yes | Copyright (c) Meta Platforms, Inc. and affiliates. | <https://react.dev/> |
| `react-dom` | `19.2.8` | MIT | yes | Copyright (c) Meta Platforms, Inc. and affiliates. | <https://react.dev/> |
| `react-easy-crop` | `6.2.3` | MIT | yes | Copyright (c) 2022 Valentin Hervieu | <https://ValentinH.github.io/react-easy-crop/> |
| `react-fast-compare` | `3.2.2` | MIT | no | Copyright (c) 2018 Formidable Labs<br>Copyright (c) 2017 Evgeny Poberezkin | <https://github.com/FormidableLabs/react-fast-compare> |
| `react-helmet-async` | `3.0.0` | Apache-2.0 | yes |    2. Grant of Copyright License. Subject to the terms and conditions of<br>   Copyright 2018 The New York Times Company | <https://github.com/staylor/react-helmet-async#readme> |
| `react-i18next` | `16.0.0` | MIT | yes | Copyright (c) 2025 i18next | <https://github.com/i18next/react-i18next> |
| `react-remove-scroll` | `2.7.2` | MIT | no | Copyright (c) 2017 Anton Korzunov | <https://github.com/theKashey/react-remove-scroll#readme> |
| `react-remove-scroll-bar` | `2.3.8` | MIT | no | See exact package archive; attribution review pending | <https://github.com/theKashey/react-remove-scroll-bar#readme> |
| `react-router` | `7.17.0` | MIT | no | Copyright (c) React Training LLC 2015-2019<br>Copyright (c) Remix Software Inc. 2020-2021<br>Copyright (c) Shopify Inc. 2022-2023 | <https://github.com/remix-run/react-router#readme> |
| `react-router-dom` | `7.17.0` | MIT | yes | Copyright (c) React Training LLC 2015-2019<br>Copyright (c) Remix Software Inc. 2020-2021<br>Copyright (c) Shopify Inc. 2022-2023 | <https://github.com/remix-run/react-router#readme> |
| `react-style-singleton` | `2.2.3` | MIT | no | Copyright (c) 2017 Anton Korzunov | <https://github.com/theKashey/react-style-singleton#readme> |
| `readable-stream` | `3.6.2` | MIT | no | Copyright Node.js contributors. All rights reserved.<br>Copyright Joyent, Inc. and other Node contributors. All rights reserved. | <https://github.com/nodejs/readable-stream#readme> |
| `regenerator-runtime` | `0.14.1` | MIT | no | Copyright (c) 2014-present, Facebook, Inc. | <https://www.npmjs.com/package/regenerator-runtime/v/0.14.1> |
| `regex` | `6.1.0` | MIT | no | Copyright (c) 2025 Steven Levithan | <https://github.com/slevithan/regex#readme> |
| `regex-recursion` | `6.0.2` | MIT | no | Copyright (c) 2025 Steven Levithan | <https://github.com/slevithan/regex-recursion#readme> |
| `regex-utilities` | `2.3.0` | MIT | no | Copyright (c) 2024 Steven Levithan | <https://github.com/slevithan/regex-utilities#readme> |
| `remark` | `15.0.1` | MIT | no | Copyright (c) 2014 Titus Wormer <tituswormer@gmail.com> | <https://remark.js.org> |
| `remark-gfm` | `4.0.1` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/remarkjs/remark-gfm#readme> |
| `remark-inline-links` | `7.0.0` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/remarkjs/remark-inline-links#readme> |
| `remark-math` | `6.0.0` | MIT | no | See exact package archive; attribution review pending | <https://github.com/remarkjs/remark-math/tree/main#readme> |
| `remark-parse` | `11.0.0` | MIT | no | Copyright (c) 2014 Titus Wormer <tituswormer@gmail.com> | <https://remark.js.org> |
| `remark-stringify` | `11.0.0` | MIT | no | Copyright (c) 2014 Titus Wormer <tituswormer@gmail.com> | <https://remark.js.org> |
| `rimraf` | `3.0.2` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/isaacs/rimraf#readme> |
| `rimraf` | `6.1.3` | BlueOak-1.0.0 | no | See exact package archive; attribution review pending | <https://github.com/isaacs/rimraf#readme> |
| `rope-sequence` | `1.3.4` | MIT | no | Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> | <https://github.com/marijnh/rope-sequence#readme> |
| `safe-buffer` | `5.2.1` | MIT | no | Copyright (c) Feross Aboukhadijeh | <https://github.com/feross/safe-buffer> |
| `scheduler` | `0.27.0` | MIT | no | Copyright (c) Meta Platforms, Inc. and affiliates. | <https://react.dev/> |
| `semver` | `6.3.1` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/npm/node-semver#readme> |
| `semver` | `7.8.4` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/npm/node-semver#readme> |
| `set-blocking` | `2.0.0` | ISC | no | Copyright (c) 2016, Contributors | <https://github.com/yargs/set-blocking#readme> |
| `set-cookie-parser` | `2.7.2` | MIT | no | Copyright (c) 2015 Nathan Friedly <nathan@nfriedly.com> (http://nfriedly.com/) | <https://github.com/nfriedly/set-cookie-parser> |
| `shallowequal` | `1.1.0` | MIT | no | Copyright (c) 2017 Alberto Leal <mailforalberto@gmail.com> (github.com/dashed) | <https://github.com/dashed/shallowequal#readme> |
| `shiki` | `4.3.1` | MIT | yes | Copyright (c) 2021 Pine Wu<br>Copyright (c) 2023 Anthony Fu <https://github.com/antfu> | <https://github.com/shikijs/shiki#readme> |
| `signal-exit` | `3.0.7` | ISC | no | Copyright (c) 2015, Contributors | <https://github.com/tapjs/signal-exit#readme> |
| `simple-concat` | `1.0.1` | MIT | no | Copyright (c) Feross Aboukhadijeh | <https://github.com/feross/simple-concat> |
| `simple-get` | `3.1.1` | MIT | no | Copyright (c) Feross Aboukhadijeh | <https://github.com/feross/simple-get> |
| `source-map-js` | `1.2.1` | BSD-3-Clause | no | Copyright (c) 2009-2011, Mozilla Foundation and contributors | <https://github.com/7rulnik/source-map-js> |
| `space-separated-tokens` | `2.0.2` | MIT | no | Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/space-separated-tokens#readme> |
| `speech-rule-engine` | `5.0.0-rc.4` | Apache-2.0 | no |    2. Grant of Copyright License. Subject to the terms and conditions of | <https://github.com/zorkow/speech-rule-engine> |
| `string_decoder` | `1.3.0` | MIT | no | Copyright Node.js contributors. All rights reserved.<br>Copyright Joyent, Inc. and other Node contributors. All rights reserved. | <https://github.com/nodejs/string_decoder> |
| `string-width` | `4.2.3` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) | <https://github.com/sindresorhus/string-width#readme> |
| `stringify-entities` | `4.0.4` | MIT | no | Copyright (c) 2015 Titus Wormer <mailto:tituswormer@gmail.com> | <https://github.com/wooorm/stringify-entities#readme> |
| `strip-ansi` | `6.0.1` | MIT | no | Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (sindresorhus.com) | <https://github.com/chalk/strip-ansi#readme> |
| `style-mod` | `4.1.3` | MIT | no | Copyright (C) 2018 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/marijnh/style-mod#readme> |
| `swr` | `2.5.1` | MIT | yes | Copyright (c) 2023 Vercel, Inc. | <https://swr.vercel.app> |
| `tailwind-merge` | `3.3.1` | MIT | yes | Copyright (c) 2021 Dany Castillo | <https://github.com/dcastil/tailwind-merge> |
| `tar` | `6.2.1` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/isaacs/node-tar#readme> |
| `text-encoding-shim` | `1.0.5` | MIT | no | Copyright (c) 2016 Till Affeldt | <https://www.npmjs.com/package/text-encoding-shim/v/1.0.5> |
| `tr46` | `0.0.3` | MIT | no | See exact package archive; attribution review pending | <https://github.com/Sebmaster/tr46.js#readme> |
| `trim-lines` | `3.0.1` | MIT | no | Copyright (c) 2015 Titus Wormer <mailto:tituswormer@gmail.com> | <https://github.com/wooorm/trim-lines#readme> |
| `trough` | `2.2.0` | MIT | no | Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/trough#readme> |
| `tslib` | `2.8.1` | 0BSD | no | Copyright (c) Microsoft Corporation. | <https://www.typescriptlang.org/> |
| `typescript` | `5.9.3` | Apache-2.0 | no | 2. Grant of Copyright License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work and such Derivative Works in Source or Object form. | <https://www.typescriptlang.org/> |
| `unified` | `11.0.5` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://unifiedjs.com> |
| `unist-util-is` | `6.0.1` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/unist-util-is#readme> |
| `unist-util-position` | `5.0.0` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/unist-util-position#readme> |
| `unist-util-remove-position` | `5.0.0` | MIT | no | Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/unist-util-remove-position#readme> |
| `unist-util-stringify-position` | `4.0.0` | MIT | no | Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/unist-util-stringify-position#readme> |
| `unist-util-visit` | `5.0.0` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/unist-util-visit#readme> |
| `unist-util-visit-parents` | `6.0.2` | MIT | no | Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/syntax-tree/unist-util-visit-parents#readme> |
| `use-callback-ref` | `1.3.3` | MIT | no | Copyright (c) 2017 Anton Korzunov | <https://github.com/theKashey/use-callback-ref#readme> |
| `use-sidecar` | `1.1.3` | MIT | no | Copyright (c) 2017 Anton Korzunov | <https://github.com/theKashey/use-sidecar> |
| `use-sync-external-store` | `1.6.0` | MIT | no | Copyright (c) Meta Platforms, Inc. and affiliates. | <https://github.com/facebook/react#readme> |
| `util-deprecate` | `1.0.2` | MIT | no | Copyright (c) 2014 Nathan Rajlich <nathan@tootallnate.net> | <https://github.com/TooTallNate/util-deprecate> |
| `vfile` | `6.0.3` | MIT | no | Copyright (c) 2015 Titus Wormer <tituswormer@gmail.com> | <https://github.com/vfile/vfile#readme> |
| `vfile-message` | `4.0.3` | MIT | no | Copyright (c) Titus Wormer <tituswormer@gmail.com> | <https://github.com/vfile/vfile-message#readme> |
| `void-elements` | `3.1.0` | MIT | no | Copyright (c) 2014 hemanth | <https://github.com/jadejs/void-elements> |
| `vue` | `3.5.39` | MIT | no | Copyright (c) 2018-present, Yuxi (Evan) You | <https://vuejs.org/> |
| `w3c-keyname` | `2.2.8` | MIT | no | Copyright (C) 2016 by Marijn Haverbeke <marijn@haverbeke.berlin> and others | <https://github.com/marijnh/w3c-keyname#readme> |
| `web-streams-polyfill` | `4.3.0` | MIT | no | Copyright (c) 2026 Mattias Buelens<br>Copyright (c) 2016 Diwank Singh Tomer | <https://github.com/MattiasBuelens/web-streams-polyfill#readme> |
| `webidl-conversions` | `3.0.1` | BSD-2-Clause | no | Copyright (c) 2014, Domenic Denicola | <https://github.com/jsdom/webidl-conversions#readme> |
| `whatwg-url` | `5.0.0` | MIT | no | Copyright (c) 2015–2016 Sebastian Mayr | <https://github.com/jsdom/whatwg-url#readme> |
| `wicked-good-xpath` | `1.3.0` | MIT | no | Copyright (c) 2007 Cybozu Labs, Inc.<br>Copyright (c) 2012 Google Inc. | <https://github.com/google/wicked-good-xpath> |
| `wide-align` | `1.1.5` | ISC | no | Copyright (c) 2015, Rebecca Turner <me@re-becca.org> | <https://github.com/iarna/wide-align#readme> |
| `wrappy` | `1.0.2` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/npm/wrappy> |
| `yallist` | `4.0.0` | ISC | no | Copyright (c) Isaac Z. Schlueter and Contributors | <https://github.com/isaacs/yallist#readme> |
| `zustand` | `5.0.14` | MIT | yes | Copyright (c) 2019 Paul Henschel | <https://github.com/pmndrs/zustand> |
| `zwitch` | `2.0.4` | MIT | no | Copyright (c) 2016 Titus Wormer <tituswormer@gmail.com> | <https://github.com/wooorm/zwitch#readme> |

## Exact-version license additions

These texts are copied from the already-installed, locked versions, preserving their clauses
and attribution. A missing final newline is normalized in two copies; no license is substituted.

| Package | Declared license | Included package-specific text |
| --- | --- | --- |
| `@cloudbase/js-sdk@3.8.0` | Apache-2.0 | [cloudbase-js-sdk-3.8.0-Apache-2.0.txt](licenses/cloudbase-js-sdk-3.8.0-Apache-2.0.txt) |
| `@mattiasbuelens/web-streams-adapter@0.1.0` | MIT | [web-streams-adapter-0.1.0-MIT.txt](licenses/web-streams-adapter-0.1.0-MIT.txt) |
| `@rinspacehq/markdown-writer@0.3.4` | MIT | [markdown-writer-0.3.4-MIT.txt](licenses/markdown-writer-0.3.4-MIT.txt) |
| `bson@6.10.4` | Apache-2.0 | [bson-6.10.4-Apache-2.0.txt](licenses/bson-6.10.4-Apache-2.0.txt) |
| `core-js-pure@3.49.0` | MIT | [core-js-pure-3.49.0-MIT.txt](licenses/core-js-pure-3.49.0-MIT.txt) |
| `lodash@4.18.1` | MIT | [lodash-4.18.1-MIT.txt](licenses/lodash-4.18.1-MIT.txt) |
| `regenerator-runtime@0.14.1` | MIT | [regenerator-runtime-0.14.1-MIT.txt](licenses/regenerator-runtime-0.14.1-MIT.txt) |
| `text-encoding-shim@1.0.5` | MIT | [text-encoding-shim-1.0.5-MIT.txt](licenses/text-encoding-shim-1.0.5-MIT.txt) |

## Additional Computer font paths

The existing family notices and [OFL-1.1 text](licenses/OFL-1.1.txt) also accompany these
six paths. Family, version, copyright and license URL are embedded SFNT metadata from the
candidate bytes; they are not evidence of a new download from a floating font source.

| Candidate path | Embedded family | Embedded version | Copyright | License metadata |
| --- | --- | --- | --- | --- |
| `public/fonts/computer/fira-code-latin.woff2` | Fira Code Light | Version 5.002 | Copyright 2014-2020 The Fira Code Project Authors (https://github.com/tonsky/FiraCode) | OFL-1.1; <http://scripts.sil.org/OFL> |
| `public/fonts/computer/newsreader-latin.woff2` | Newsreader 16pt | Version 1.003 | Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader) | OFL-1.1; <http://scripts.sil.org/OFL> |
| `public/fonts/computer/noto-serif-sc-400.ttf` | Noto Serif SC ExtraLight | Version 2.003-H1;hotconv 1.1.1;makeotfexe 2.6.0 | (c) 2017-2024 Adobe (http://www.adobe.com/). | OFL-1.1; <https://openfontlicense.org> |
| `public/fonts/computer/noto-serif-sc-500.ttf` | Noto Serif SC ExtraLight | Version 2.003-H1;hotconv 1.1.1;makeotfexe 2.6.0 | (c) 2017-2024 Adobe (http://www.adobe.com/). | OFL-1.1; <https://openfontlicense.org> |
| `public/fonts/computer/noto-serif-sc-600.ttf` | Noto Serif SC ExtraLight | Version 2.003-H1;hotconv 1.1.1;makeotfexe 2.6.0 | (c) 2017-2024 Adobe (http://www.adobe.com/). | OFL-1.1; <https://openfontlicense.org> |
| `public/fonts/computer/noto-serif-sc-700.ttf` | Noto Serif SC ExtraLight | Version 2.003-H1;hotconv 1.1.1;makeotfexe 2.6.0 | (c) 2017-2024 Adobe (http://www.adobe.com/). | OFL-1.1; <https://openfontlicense.org> |

## Current template and asset paths

The existing CC0 template terms in [ASSET-LICENSES.md](ASSET-LICENSES.md) are retained.
The eight current fixed template inputs live under `contracts/templates/latex-article.tex`,
`contracts/templates/latex-article/` and `contracts/templates/latex-book/`.
The frontend-local `scripts/build-latex-template-archives.mjs` generates the existing
`public/templates/latex-article.tar.gz` and
`public/templates/latex-book.tar.gz` filenames.
Historical root `templates/` references in the retained attribution table are provenance,
not a dependency on the private parent repository.

The existing download-page screenshot at
`public/assets/download/rinspace-inner-explore-mobile.png` is retained by the maintainer's explicit scope decision;
this does not create additional rights in third-party content depicted in the image.
The registration icon `public/assets/beian-mps.png` is excluded from this candidate;
the asset-policy exclusion remains effective. Brand and trademark rights remain separate.

## License texts and attribution

The existing canonical texts are included under `licenses/`, together with the eight
package-specific additions above. This does not complete the required package-specific
copyright/NOTICE and embedded-bundle review for every dependency. Package source archives
and the lockfile remain the authority for package-specific text; final source distributions,
release notices and SBOMs must be checked together.

The complete Animate UI upstream catalog is excluded from the public candidate.
The application-integrated files under `src/components/animate-ui/` retain the bundled
MIT + Commons Clause terms and are outside Rinspace commercial relicensing; see
[LICENSING.md](LICENSING.md). This notice does not relicense those files.

Questions about this notice may be sent to `lunifans@outlook.com`.
