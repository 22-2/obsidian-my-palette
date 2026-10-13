# Toolchain

This project uses pnpm scripts directly. The plugin is bundled with esbuild (`esbuild.config.mjs`), unit tests run on Vitest (`vitest.config.mts`), formatting uses oxfmt, and linting uses ESLint with the Obsidian plugin rules. Development details are in `docs/DEVELOPMENT.md`.

## Commands

- `pnpm install`: install dependencies and point Git at `.githooks/` (the pre-commit hook formats staged files with oxfmt).
- `pnpm dev`: watch build into `dist/`.
- `pnpm build`: production build into `dist/` (`main.js`, `styles.css`).
- `pnpm format` / `pnpm format:check`: format with oxfmt, or only report unformatted files.
- `pnpm lint`: ESLint.
- `pnpm check-types`: TypeScript check.
- `pnpm test`: unit tests (`src/**/*.test.ts`).
- `pnpm e2e`: end-to-end tests in a real Obsidian through Playwright.

## Review Checklist

- [ ] Run `pnpm install` after pulling remote changes and before getting started.
- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm check-types` and `pnpm test` before committing.
- [ ] Use the terms in `docs/GLOSSARY.md` for any UI text.
