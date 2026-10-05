# Frontend-local compatibility inputs

These are derived test/generation snapshots, not another editable business
contract source. The private canonical inputs retain authority until the
coordinated source/release policy migration. Do not edit the snapshots alone.
The manifest binds each named input to its path, baseline commit and SHA-256.
Run the private consistency check after an approved canonical contract change:

    node scripts/check-frontend-input-snapshots.mjs

Frontend type checks, route generation and unit tests need only this directory;
they never read a private parent repository. The wallet vectors are synthetic
validation cases (including the deliberately rejected literal "secret"), not
real account data or credentials. The route inventory is the unchanged
historical 87-route baseline, not a live user-content export.

The manifest now contains 20 inputs: the original 13 plus seven files completing
the article/book LaTeX template trees. The original article main.tex snapshot
stays at templates/latex-article.tex and is reused, not copied a second time.
The frontend generator creates both archives from these eight template inputs.
The private legacy entry first checks all eight against canonical templates/;
canonical backend inputs and project provisioning are not moved or rewritten.

This directory does not establish export approval or a licensing conclusion.
Third-party assets and the public repository still require their separate
review and coordinated activation. No private history, environment files,
production storage or operational secrets belong here.
