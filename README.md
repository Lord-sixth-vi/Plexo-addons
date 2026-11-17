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

## Grayjay plugins

Plexo can also run Grayjay plugins (turn on Settings → Add-ons → Grayjay plugins).
Install one by pasting its config JSON link in the Add-ons tab, for example:

- PeerTube: `https://plugins.grayjay.app/PeerTube/PeerTubeConfig.json`
- Odysee: `https://plugins.grayjay.app/Odysee/OdyseeConfig.json`

Grayjay entries in `index.json` point straight at the plugin's config link.
