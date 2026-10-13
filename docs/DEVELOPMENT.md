# Development

My Palette is written in TypeScript and bundled with esbuild. Source is organized by feature under `src/`, with unit tests colocated next to the pure search, settings and Obsidian-excluded file logic.

Requirements: Node.js and pnpm.

## Commands

- `pnpm install`: install dependencies. It also points Git at `.githooks/`, whose pre-commit hook formats staged files with oxfmt.
- `pnpm dev`: start the watch build.
- `pnpm format`: format with oxfmt. `pnpm format:check` only reports unformatted files.
- `pnpm lint`: lint with ESLint and the Obsidian plugin rules.
- `pnpm test`: run unit tests with Vitest.
- `pnpm check-types`: run the TypeScript check.
- `pnpm build`: build a production bundle.
- `pnpm e2e`: run the end-to-end tests (see below).
- `pnpm ui:shots`: capture the palette and settings screens into a new `run-*` folder under `UI_SHOT_DIR` (default: the OS temp folder). The VS Code task "My Palette: Capture UI screenshots" runs it and opens the folder.

Formatting, linting, type checking and tests are separate so they can be run independently while refactoring.

`esbuild.config.mjs` writes `main.js` and `styles.css` to `dist/`. Copy them with `manifest.json` into a Vault's plugin folder, then enable or reload the plugin in Obsidian.

## End-to-end tests

`pnpm e2e` builds the plugin, installs it into a temporary Vault and drives a real Obsidian with Playwright through [obsidian-e2e-toolkit](https://github.com/22-2/obsidian-e2e-toolkit). The specs live in `e2e/`; Vitest only runs `src/**/*.test.ts`.

- Node.js 23 or later is required by the toolkit.
- `pnpm e2e` first runs Electron's `install.js`, which downloads the Electron binary on the first run; a plain `pnpm install` does not fetch it.
- On a machine without a display (Linux servers, containers), run `xvfb-run -a pnpm e2e`.
- The Obsidian build is the one bundled with the toolkit. Set `OBSIDIAN_E2E_TOOLKIT_OBSIDIAN_VERSION` and rerun `node node_modules/obsidian-e2e-toolkit/setup.mjs` to test another version.
- Failed tests attach a screenshot and the DOM to the Playwright report in `test-results/`.
- Everything search only checks the request sent to the HTTP server, because the plugin accepts Windows-style paths only.

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
