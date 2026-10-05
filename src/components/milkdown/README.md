# Rinspace Milkdown integration

Rinspace's Markdown article page and book section consume the public
`@rinspacehq/markdown-writer` package. [Milkdown and Crepe](https://github.com/Milkdown/milkdown)
provide the editor framework and built-in features. The public package owns
Rinspace's title field, editor frame, Crepe configuration, writing enhancements,
math interaction, LaTeX panel, CodeMirror control, and writing styles.

## Product hosts

- `pages/BlogMarkdown` combines the public title and editor components with
  account, tags, cover, source visibility, saving, and publishing.
- `components/RinMilkdownEditor` uses the shared editor factory for
  `pages/MarkdownBookSection`.

Question, answer, discussion, and old dynamics routes are historical paths.
Their remaining imports do not define this supported editor surface.

## Private adapters

- `editor.ts` passes image upload and Quiver toolbar callbacks to the public
  `createWriterEditor` factory. It explicitly retains the production KaTeX
  trust setting.
- `interactions.ts` joins public math interactions with private Quiver image
  reopening. `preset.ts` delegates to the public registration list.
- `mathCommands.ts`, `mathSelection.ts`, `mathEvents.ts`,
  `mathMarkdown.ts`, `mathView.ts`, `mathReparse.ts`,
  `LatexBlockEditor.tsx`, and `topBar.ts` are compatibility re-exports.
  Editable implementations live in the public package.
- `quiver.ts`, `useQuiverEditor.ts`, and `QuiverDialog.tsx` own the
  Rinspace-specific Quiver service and UI. Autosave, image storage,
  localization, and publication remain private host integrations.

Do not restore a second Crepe feature configuration, plugin registration list,
or private copy of the public writing components. Public changes enter Rinspace
through a reviewed, exact GitHub Release asset and lockfile integrity.
