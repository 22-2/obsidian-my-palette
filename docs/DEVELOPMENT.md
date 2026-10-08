# Development

My Palette is written in TypeScript and built with Vite+. Source is organized by feature under `src/`, with unit tests colocated next to the pure search, settings and ignored-note logic.

Requirements: Node.js, pnpm, and the global Vite+ CLI (`vp`). Install `vp` by following the [Vite+ guide](https://viteplus.dev/guide/); every `vp` command below fails without it. `vp help` lists what it can do.

## Commands

- `vp install`: install dependencies.
- `vp dev`: start the watch build.
- `vp check`: format and lint.
- `vp test --run`: run unit tests.
- `pnpm check-types`: run the TypeScript check.
- `vp build`: build a production bundle.
- `pnpm e2e`: run the end-to-end tests (see below).

Formatting and linting run through `vp check`; type checking and tests are separate so they can be run independently while refactoring.

The Vite configuration copies the production bundle to `dist/` and to the configured development Vault plugin directory. Enable or reload the plugin in Obsidian after the bundle is copied.

## End-to-end tests

`pnpm e2e` builds the plugin, installs it into a temporary Vault and drives a real Obsidian with Playwright through [obsidian-e2e-toolkit](https://github.com/22-2/obsidian-e2e-toolkit). The specs live in `e2e/`; Vitest only runs `src/**/*.test.ts`.

- Node.js 23 or later is required by the toolkit.
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
