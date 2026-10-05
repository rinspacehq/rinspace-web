# Rinspace Font Library

Production web fonts live here. Do not add production typography assets under
`ui/public/fonts/computer`; that directory is kept only for the isolated
`/test/computer` experiment.

Runtime entry:

```text
/fonts/library/rinspace-fonts.css
```

Regenerate the library with:

```bash
node scripts/download-font-library.mjs
```

The generated CSS exposes the original family names used across the site and
Rinspace aliases used by article detail typography:

- `IBM Plex Sans`
- `IBM Plex Mono`
- `JetBrains Mono`
- `Fira Code`
- `Newsreader`
- `Noto Sans SC`
- `Noto Serif SC`
- `Rinspace Code`
- `Rinspace Newsreader`
- `Rinspace Noto Sans SC`
- `Rinspace Noto Serif SC`

The CSS file and font shards are generated assets. Edit
`scripts/download-font-library.mjs` instead of editing generated `@font-face`
rules by hand.
