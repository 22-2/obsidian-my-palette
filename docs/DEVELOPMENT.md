# Development

My Palette is written in TypeScript and built with Vite+. Source is organized by feature under `src/`, with unit tests colocated next to the pure search, settings and ignored-note logic.

Requirements: Node.js and pnpm.

## Commands

- `vp install`: install dependencies.
- `vp dev`: start the watch build.
- `vp check`: format and lint.
- `vp test --run`: run unit tests.
- `pnpm check-types`: run the TypeScript check.
- `vp build`: build a production bundle.

Formatting and linting run through `vp check`; type checking and tests are separate so they can be run independently while refactoring.

The Vite configuration copies the production bundle to `dist/` and to the configured development Vault plugin directory. Enable or reload the plugin in Obsidian after the bundle is copied.

## Releasing

1. Update `manifest.json` with the new version and the minimum Obsidian version required.
2. Add `"new-plugin-version": "minimum-obsidian-version"` to `versions.json` so older Obsidian versions can download a compatible release.
3. Create a GitHub release whose tag is the exact version number, without a `v` prefix.
4. Attach `manifest.json`, `main.js` and `styles.css` as binary files. `manifest.json` must also stay in the repository root.
5. Publish the release.

After editing `minAppVersion` by hand, `npm version patch|minor|major` bumps the version in `manifest.json` and `package.json` and adds the entry to `versions.json`.

## Community plugin list

See the [plugin review guidelines](https://github.com/obsidianmd/obsidian-releases/blob/master/plugin-review.md), publish an initial release, and open a pull request against [obsidian-releases](https://github.com/obsidianmd/obsidian-releases).

## Reference

- [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- Design notes: [DETAILED_SPECIFICATION.md](DETAILED_SPECIFICATION.md), [REFACTORING_ROADMAP.md](REFACTORING_ROADMAP.md)
