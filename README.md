# My Palette

My Palette is a keyboard-first command palette for Obsidian with Everything 1.5a search support.

[日本語版](README.ja.md)

The plugin is written in TypeScript and built with Vite+. Source code is organized by feature under `src/`, with unit tests colocated next to pure search, settings, and ignored-note logic.

## Development

Requirements: Node.js and pnpm.

- Install dependencies with `vp install`.
- Start the watch build with `vp dev`.
- Run formatting and lint checks with `vp check`.
- Run unit tests with `vp test --run`.
- Run the TypeScript check with `pnpm check-types`.
- Build a production bundle with `vp build`.

The Vite configuration copies the production bundle to `dist/` and the configured development Vault plugin directory.

## Releasing new releases

- Update your `manifest.json` with your new version number, such as `1.0.1`, and the minimum Obsidian version required for your latest release.
- Update your `versions.json` file with `"new-plugin-version": "minimum-obsidian-version"` so older versions of Obsidian can download an older version of your plugin that's compatible.
- Create new GitHub release using your new version number as the "Tag version". Use the exact version number, don't include a prefix `v`. See here for an example: https://github.com/obsidianmd/obsidian-sample-plugin/releases
- Upload the files `manifest.json`, `main.js`, `styles.css` as binary attachments. Note: The manifest.json file must be in two places, first the root path of your repository and also in the release.
- Publish the release.

> You can simplify the version bump process by running `npm version patch`, `npm version minor` or `npm version major` after updating `minAppVersion` manually in `manifest.json`.
> The command will bump version in `manifest.json` and `package.json`, and add the entry for the new version to `versions.json`

## Adding your plugin to the community plugin list

- Check https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md
- Publish an initial version.
- Make sure you have a `README.md` file in the root of your repo.
- Make a pull request at https://github.com/obsidianmd/obsidian-releases to add your plugin.

## How to use

- Clone this repository.
- Run `vp install`.
- Run `vp dev` while developing.
- Enable or reload the plugin in Obsidian after the bundle is copied to the development Vault.

### Search operators

In non-Everything search modes, separate terms with spaces for AND matching and
use `|` for OR branches. For example, `meeting project | agenda` matches notes
containing both `meeting` and `project`, or notes containing `agenda`.

Everything queries are passed through unchanged and continue to use Everything's
own search syntax.

### Tag search

File search includes both inline tags and frontmatter `tags`. A query such as
`#project` searches tags directly; ordinary terms can also match tags. Matching
tags are shown below the file name, with up to three tags and a `+N` count for
additional matches. Hover the row to see the full matching-tag list.

### Adding tags

Run `Insert tags into current note` to add tags to the frontmatter `tags` of the
active note. To tag notes from search results, right-click a palette result and
choose `Add tags…`; with several results selected, the chosen tags are added to
every selected Markdown note. Excluded files are skipped.

Candidates are ordered as recently inserted tags, then tags used by linked notes
(outgoing links and backlinks, up to 10 tags marked `Related N`), then by usage
count. Tags that every target note already has are shown last as `Registered`
and cannot be selected. Press `Enter` to select or deselect a tag without
closing the list, and `Ctrl+Enter` or the `Add …` row to add the selection.
Typing a tag that does not exist yet offers it as a new tag. Recently inserted
tags are stored per Vault in local IndexedDB.

### File sort priorities

Use `Open palette in right sidebar` for the regular list view, or
`Open palette table in center` for a separate table view in a center tab. Each command
reuses its own pane without replacing the other view. Duplicating a table opens
another center tab. In the table, click
a column header to add it to the sort priorities or cycle its direction and remove
it. Other sort priorities stay active; no modifier key is needed. Drag a header
to reorder columns, or right-click a header to show or hide columns. Name stays
visible so results can always be identified.
The numbered sort controls let you change each direction, move priorities earlier
or later, remove a sort, or reset to the search ranking. Columns include Name,
Path, Modified, and `prior`; missing metadata sorts last. Each table pane remembers
its sort priorities, column order, and hidden columns, including when duplicated
or restored. Hidden columns retain their active sort priorities.

Table pages contain 50 rows, sorted across all results returned by the search
provider before paging. Everything searches remain limited by their configured
maximum result count.

File ordering is configured from `Settings → My Palette → Vault file search → Sort
priorities`, with one priority per line. The first priority that differs wins.
Supported priorities are `Filename prefix match`, `Filename fuzzy match`,
`Alias prefix match`, `Alias fuzzy match`, `Tag match`, `Match coverage`, `Folder path match`,
`Activity`, `Last modified`, `Aliases count`, `Alphabetical`, `Alphabetical reverse`,
and `@prior` with an optional `:asc` or `:desc` suffix. Missing `prior` values are
sorted last.

For example, `@prior:desc` places notes with higher numeric `prior` values first;
the default ranks filename matches before alias and tag matches, then match coverage
and folder path; `prior` comes before `Activity`. `Folder path match` compares the
directory portion of the Vault-relative path, excluding the filename. `Activity`
combines the current workspace's recent-open order with persistent palette usage,
using usage as a tie-breaker after recent-open status. `Last modified` is an explicit
mtime priority; when all configured priorities tie, the Vault-relative path provides
a deterministic fallback. `Tag match` orders notes with more matching tags first.
`Match coverage` totals matched query characters across distinct filenames, paths,
aliases, and tags, using only the strongest OR branch.
`Aliases count` is available as an optional secondary signal and orders notes with
more aliases first.

The `Lower prior folders` setting under `Vault file search` accepts one folder
path per line. Enable the independent `Lower prior folders` criterion in `Sort
priorities` to rank notes in those folders and subfolders lower, even without
`@prior`. Move it above filename or activity criteria to give folder demotion
precedence; configure blank and typed input separately. Contiguous matches and
include-ignored preference still run first. Existing configured folder rules
enable this criterion at the top of both lists once on upgrade.

Complete contiguous matches across a filename, path, alias, or tag are always
preferred over fuzzy-only matches before the configured priority list is applied.

## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/your-plugin-id/`.

## Code quality

Formatting and linting are handled by Vite+ through `vp check`. Type checking and tests are separate commands so they can be run independently while refactoring.

## Funding URL

You can include funding URLs where people who use your plugin can financially support it.

The simple way is to set the `fundingUrl` field to your link in your `manifest.json` file:

```json
{
	"fundingUrl": "https://buymeacoffee.com"
}
```

If you have multiple URLs, you can also do:

```json
{
	"fundingUrl": {
		"Buy Me a Coffee": "https://buymeacoffee.com",
		"GitHub Sponsor": "https://github.com/sponsors",
		"Patreon": "https://www.patreon.com/"
	}
}
```

## API Documentation

See https://github.com/obsidianmd/obsidian-api
