# Saga20 for Obsidian

Browse and read your [Saga20](https://saga20.com) tabletop campaign sessions inside Obsidian.

[Saga20](https://saga20.com) turns your D&D / TTRPG session recordings into searchable summaries and recaps. This plugin pulls those sessions into Obsidian so you can browse, read, and save them next to the rest of your campaign notes.

This is the official open-source Obsidian client for the Saga20 Public API. Issues, pull requests, and feedback are welcome. See [Contributing](#contributing) below.

## Features

- **Sidebar list:** every session in your campaign with date and status, filterable by title.
- **Full-recap view:** opens any session in a tab and renders the complete `summary_markdown` (no 4096-char Discord limit).
- **Quick open:** `Saga20: Open session…` opens a fuzzy-search palette over your sessions.
- **Save to vault:** drop a session into your vault as a real `.md` note with frontmatter (`saga20_id`, status, recording date, source URL).
- **Cached index:** the session list is cached for 60s by default to keep things snappy.

## Installation

This plugin isn't in the Community Plugins catalog yet. Until it is, you have a few options.

### Option 1: install from a GitHub release

1. Grab the latest `manifest.json`, `main.js`, and `styles.css` from the [Releases page](https://github.com/secondwind77/saga20-obsidian-plugin/releases).
2. Drop them into a folder named `saga20` inside `<your vault>/.obsidian/plugins/`.
3. In Obsidian, open **Settings → Community plugins**, enable Community plugins if you haven't, and toggle on **Saga20**.

### Option 2: install with BRAT

If you use [obsidian42-brat](https://github.com/TfTHacker/obsidian42-brat) to follow plugins that aren't in the catalog yet:

1. Install BRAT from Community Plugins.
2. **BRAT → Add Beta plugin** and paste `secondwind77/saga20-obsidian-plugin`.
3. Enable **Saga20** under Community plugins.

### Option 3: build from source

```bash
git clone https://github.com/secondwind77/saga20-obsidian-plugin.git
cd saga20-obsidian-plugin
npm install
npm run build
```

Then copy `manifest.json`, `main.js`, and `styles.css` into `<your vault>/.obsidian/plugins/saga20/`.

## Setup

1. Get a Public API key at [app.saga20.com](https://app.saga20.com). Public API access requires an active paid plan on the owning Saga20 account.
2. In Obsidian, open **Settings → Saga20** and paste the key (it starts with `s20_live_`).
3. Click **Test** to confirm the key works, then close settings.

## Usage

| Command | What it does |
|---|---|
| `Saga20: Browse sessions` | Open the sidebar list. Click any session to open its full recap. |
| `Saga20: Open session…` | Fuzzy-search by title or session number, opens the recap. |
| `Saga20: Save session to vault…` | Pick a session, drop it into your vault as a markdown note. |
| `Saga20: Refresh sessions cache` | Force a re-pull of the session list. |

You can also right-click a session in the sidebar for the same actions.

## Settings

- **API key:** your Saga20 Public API key.
- **Notes folder:** where saved sessions get written. Default is `Saga20 Sessions`.
- **Cache TTL (seconds):** how long to cache the session list. `0` disables caching.
- **API base URL / App base URL:** overrides for non-default deployments. Don't touch unless told to.

## Privacy

This plugin talks to one external service: the Saga20 Public API at `https://app.saga20.com/api/public/v1`. Specifically:

- Your API key is stored locally via Obsidian's per-vault `loadData()` / `saveData()` (in `<vault>/.obsidian/plugins/saga20/data.json`). It never leaves your machine except as a `Bearer` token on requests to Saga20.
- Session lists and recap content are fetched from Saga20 on demand and cached in memory only. No on-disk cache other than notes you explicitly save via **Save to vault**.
- Nothing is sent to any third party. There is no telemetry, analytics, or remote logging.
- All HTTP traffic uses Obsidian's `requestUrl` so requests honor Obsidian's network handling. No extra fetch shims.

If you stop using the plugin, you can remove your API key from settings or delete the plugin folder entirely. Both wipe the stored key.

## How it differs from the Discord bot

Saga20 also has an official Discord bot. The trade-offs:

| | Discord bot | Obsidian plugin |
|---|---|---|
| Auth scope | One key per Discord guild | One key per Obsidian vault |
| Recap rendering | Embed, truncated to 4096 chars | Full markdown, rendered natively |
| List paging | 25 per page (Discord limit) | All sessions in one filterable list |
| Output | Ephemeral chat messages | Tabs + optional `.md` notes |

The underlying API is the same: `https://app.saga20.com/api/public/v1`.

## Contributing

This plugin is open source and contributions are welcome.

- Found a bug? Please [open an issue](https://github.com/secondwind77/saga20-obsidian-plugin/issues/new) with a clear repro and your Obsidian version.
- Have an idea? Open an issue first to talk it through before sinking time into a PR.
- Want to send a PR? Fork, branch, run `npm run build` to confirm it compiles, and open a PR against `main`. One feature or fix per PR makes review fast.

The codebase is small. Quick tour:

```
manifest.json        plugin manifest
main.ts              plugin class + settings tab + command wiring
api.ts               Saga20 HTTP client (uses Obsidian's requestUrl)
sessions-view.ts     left-sidebar ItemView showing the session list
session-view.ts      main-pane ItemView rendering the full recap
search-modal.ts      FuzzySuggestModal for quick-open / save flows
types.ts             shared types and default settings
styles.css           plugin styles
version-bump.mjs     bumps manifest.json + versions.json on `npm version`
esbuild.config.mjs   bundler config
```

### Development

```bash
npm install
npm run dev     # esbuild watch, rebuilds main.js on save
npm run build   # one-shot production build
```

To test changes against a real vault, point the build at your vault's plugin folder, or symlink `<vault>/.obsidian/plugins/saga20/` to your dev checkout.

### Releasing

```bash
npm version patch   # or minor / major; also rewrites manifest.json + versions.json
npm run build
```

Then create a GitHub release tagged with the new version and attach `manifest.json`, `main.js`, and `styles.css` so users can install from the release.

## Support

If this plugin saves you time, the best thing you can do is [try Saga20](https://saga20.com) and share it with your table. Feedback and bug reports on GitHub help too.

## License

[MIT](LICENSE) © Saga20

---

Built by [Saga20](https://saga20.com).
