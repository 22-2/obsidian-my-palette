# My Palette

My Palette is a keyboard-first command palette for Obsidian with Everything 1.5a search support.

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
