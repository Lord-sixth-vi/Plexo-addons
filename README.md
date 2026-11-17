# Plexo add-ons

Add-ons for the Plexo video app. Plexo reads `index.json` to show its Add-on store.

Each add-on is one JavaScript file in `addons/`. The comment lines at the top describe it:

```
// @name     Site name
// @id       org.plexo.js.site
// @version  1.0.0
// @domains  site.com, cdn.site.com
// @category Category
// @description One line about it
```

To add a new one: put the `.js` file in `addons/` and add an entry to `index.json`, with its link in this form:
`https://raw.githubusercontent.com/Lord-sixth-vi/Plexo-addons/main/addons/<file>.js`

To update one: change the file and raise its `@version` (and the version in `index.json`), and Plexo offers the update.

## Stremio add-ons

Plexo runs Stremio add-ons (Settings → Add-ons → Stremio add-ons). Paste an add-on's
`manifest.json` link (or a `stremio://` install link) in the Add-ons tab. Catalog add-ons
fill Home and search with movies and shows; stream add-ons give the links to play; subtitle
add-ons add subtitles. Start with Cinemeta: `https://v3-cinemeta.strem.io/manifest.json`

## Nuvio providers

Plexo also runs Nuvio providers (Settings → Add-ons → Nuvio providers). Paste a Nuvio
repository `manifest.json` link (or one provider `.js` link). Providers add extra links
when a movie or episode from your Stremio add-ons plays.

Stremio and Nuvio entries in `index.json` point straight at the add-on's own link.
