# My Palette

A command palette for Obsidian that finds a file first and lets you decide what to do with it afterwards. The look is borrowed from the VS Code command palette, but you can drive it with the mouse just as comfortably as with the keyboard.

[日本語版](README.ja.md)

## Why another switcher

I tried Another Quick Switcher, the core Quick Switcher, Quick Switcher++ and Omnisearch. Each was good at something, none of them felt right as a whole, so I made my own.

My Palette started as a near copy of the VS Code palette: type, pick a candidate, run it. That grammar turned out to be a poor fit for Obsidian, where there is more to decide than which entry to run:

- **Target**: which note or external file?
- **Source**: the Vault, Everything, links, backlinks, bookmarks?
- **Destination**: the current tab, a new tab, a split, the sidebar?
- **Operation**: open, copy a path, insert into a MOC, tag, move?

So the palette now works like this:

1. Type what you are looking for. No mode switch is needed for ordinary file search.
2. Choose how to handle the result afterwards (click, double-click, middle-click, right-click, or keys).
3. Advanced operations are shown only once you have a result to apply them to.

Prefixes (`>`, `e `, `bk `, …) exist for switching the search source, not as the main way to operate it.

## Features

- **Vault file search** with AND / OR terms, aliases, frontmatter `keywords`, frontmatter and inline tags, and fully configurable sort priorities.
- **Everything 1.5a search** for files outside the Vault, opened in Obsidian (Markdown) or in the OS default app.
- **Command, bookmark, link, backlink and Smart Connections search** in the same window.
- **Multi-select** with the same gestures as a file manager, then copy paths, add tags or insert MOC links to all selected notes at once.
- **Three surfaces**: a modal, a list view in the right sidebar, and a sortable table view in a center tab.
- **Excluded files on demand**: notes hidden by Obsidian's excluded folders stay out of the way until you ask for them with `i `.
- Desktop only (Windows is the primary target).

## Getting started

Open the command palette and run one of these, then bind a hotkey if you like:

| Command                                       | What it does                                                |
| --------------------------------------------- | ----------------------------------------------------------- |
| `My Palette: Open Recent palette`             | File search, starting from recently used files              |
| `My Palette: Open command list`               | Command search (starts with the `>` prefix)                 |
| `My Palette: Open palette in right sidebar`   | A persistent list view                                      |
| `My Palette: Open palette table in center`    | A persistent table view in a center tab                     |
| `My Palette: Link search` / `Backlink search` | Notes linked from / to the current note                     |
| `My Palette: Bookmark search`                 | Saved bookmarks                                             |
| `My Palette: Smart Connections search`        | Notes related to the current note (needs Smart Connections) |
| `My Palette: Move file to another folder`     | Move the current file                                       |
| `My Palette: Open file path in editor`        | Open a file by Vault path or absolute path                  |
| `My Palette: Insert tags into current note`   | Add tags to the current note                                |
| `My Palette: Insert link to MOC Relateds`     | Add mutual Relateds links to the active MOC                 |

## Using the palette

### Mouse and keyboard

Palette lists and tables keep the first result highlighted while you type, so `Enter` runs it right away and `↑`/`↓` move through results. Tag and MOC insertion add separate input and selection modes (see below) because `Space` checks candidates there.

The action (`…`) and history (clock) buttons are also available in tag insertion, MOC link insertion and destination-folder selection. Actions and Help describe the current picker. Each picker has its own search history; selecting an entry restores only the query and never inserts tags, adds links or moves a file. `Ctrl+R` opens history, and the history enablement, delay and retention settings apply to these pickers too. Highlighting uses the shared modal display preference.

| Action                 | Result                                             |
| ---------------------- | -------------------------------------------------- |
| Click                  | Select a result                                    |
| `Ctrl`+click           | Add or remove a result from the selection          |
| `Shift`+click          | Select a range                                     |
| Double-click / `Enter` | Open the result (or run the command)               |
| Middle-click           | Open in a new background tab                       |
| Right-click            | Open the action menu (acts on the whole selection) |
| `Ctrl+R`               | Search history                                     |
| `Esc`                  | Clear the query, then move focus back to the field |

The action menu offers: open, open in a background tab, open side by side, open below, show in file explorer (Everything results), copy file names, Vault-relative paths or absolute paths, insert into a MOC and add tags. The palette's menu button also has a `Help` entry that lists the prefixes and gestures for the current picker. Modals have no footer; keyboard instructions and insertion targets live in Help. Hold `Alt+H` in any search or interaction mode to gently fade out the palette or selector while inspecting a preview; releasing either key fades it back in and returns focus to the search field. This works in modals (including their backdrop), sidebar palettes and table views, preserving the query, selection and workspace layout. `Esc` closes a modal; in a persistent view it clears the query, then focuses the search field.

### Search modes

Type a prefix followed by a space to switch the search source. `>`, `e ` and `i ` can be changed in the settings.

| Prefix  | Mode                 | Purpose                                                  |
| ------- | -------------------- | -------------------------------------------------------- |
| none    | Files                | Search files in the Vault                                |
| `>`     | Commands             | Search and run Obsidian commands                         |
| `e `    | Everything           | Search the whole Everything index                        |
| `esdir` | Everything directory | Search the directory of the current note with Everything |
| `o `    | Outlinks             | Notes linked from the current note                       |
| `b `    | Backlinks            | Notes linking to the current note                        |
| `bk `   | Bookmarks            | Search saved bookmarks                                   |
| `sc `   | Smart Connections    | Notes related to the current note                        |
| `i `    | Excluded files       | Include excluded files in file search (files only)       |

`es` and `esdir` also work as zero-query shortcuts without a trailing space.

### Search syntax

Outside Everything mode, separate terms with spaces for AND and use `|` for OR. For example, `meeting project | agenda` matches notes containing both `meeting` and `project`, or notes containing `agenda`.

File search covers inline tags and frontmatter `tags`. `#project` searches tags directly, and ordinary terms can match tags too. Matching tags appear under the file name (up to three, then `+N`); hover a row to see all of them.

Frontmatter `keywords` is also searchable as a string array (for example, `keywords: [astronomy, stargazing]`), including in excluded notes searched with `i `. Matching keywords appear beside matching tags without a `#`, with up to three chips in total followed by `+N`. Hover the chips to see all matches. Hash-prefixed tag-only queries search tags only.

Everything queries are passed through unchanged and use Everything's own syntax. Everything mode needs Everything 1.5a with the official HTTP Server plugin running. See [Everything setup](#everything-setup).

## Working with several notes

Selection is shared by the palette, the tag selector and the MOC selector: click, `Ctrl`/`Shift`+click, arrow keys.

### Adding tags

Run `Insert tags into current note`, or right-click results and choose `Add tags…`. With several results selected, the tags are added to every selected Markdown note. Excluded files are skipped.

- Candidates are ordered as recently inserted tags, tags used by linked notes (up to 10, marked `Related N`), then usage count.
- Tags that every target already has appear last as `Registered` and cannot be chosen. Tags only some targets have show `On N/M notes` and stay selectable.
- Start in input mode, where Space is part of the search query. `↑`/`↓` or clicking a result switches to selection mode; `f` or clicking the input returns to input mode.
- Checked tags always appear first, including new tags, even when they do not match the query. Unchecking returns them to the normal search results.
- `→` previews the highlighted tag in Obsidian's core Search without moving focus away from the modal. In input mode the cursor must be at the end of the query; in selection mode the shortcut works anywhere.
- In selection mode, check rows with `Space`, the context menu or the check icon (which toggles only its row). `Enter` (including numpad Enter) or double-click inserts highlighted rows immediately. Run checked rows with `Ctrl+Enter`, or use `Add N now` in the context menu to run the checked and highlighted rows at once.
- The button at the right end of the input lists the checked rows, lets you uncheck them and runs them.
- Typing a tag that does not exist offers it as a new tag.
- Right-click a registered or partly applied tag and choose `Remove tag` to remove it from the target notes; inside a multi-row selection it removes every selected tag.

Recently inserted tags are stored per Vault in local IndexedDB.

### Inserting into a MOC

The MOC selector uses the same input/selection modes and gestures. Checked notes always appear first regardless of the query. `→` previews the highlighted note while keeping the modal focused. `Enter` inserts highlighted notes immediately; `Space` toggles checks in selection mode, and `Ctrl+Enter` or the checked-list button adds mutual `Relateds` links to the original MOC for every checked note, even after previewing another note. Only links inside a `Relateds` item count, not other links in the body.

Notes linked in both directions appear last and cannot be selected. Notes linked in one direction stay selectable so you can complete the link. Right-click a linked note and choose `Remove link` to remove the Relateds links in both directions.

## Views

`Open palette in right sidebar` gives the regular list view and `Open palette table in center` gives a table in a center tab. Each command reuses its own pane without replacing the other, and each pane can be duplicated from its pane menu.

In the table:

- Click a column header to add it to the sort priorities or cycle its direction and remove it. Other priorities stay active; no modifier key is needed.
- Drag a header to reorder columns. Right-click a header to show or hide columns (Name is always visible).
- The numbered sort controls change direction, move a priority earlier or later, remove it, or reset to the search ranking.
- Columns are Name, Path, Modified and `prior`. Missing metadata sorts last.
- Sort priorities, column order and hidden columns are remembered per pane, including after duplication or restart.
- Pages hold 50 rows and are sorted across all results from the search provider first. Everything searches are still limited by the configured maximum result count.

## File sort priorities

Configure the order under `Settings → My Palette → Vault file search → Sort priorities`, separately for blank and typed input. Enabled priorities run top to bottom and the first one that differs wins. When everything ties, the Vault-relative path decides.

| Priority                                | Ranks first                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `Filename prefix match`                 | Names that start with the query                                                        |
| `Filename fuzzy match`                  | Higher fuzzy score on the name                                                         |
| `Alias prefix match`                    | Aliases that start with the query                                                      |
| `Alias fuzzy match`                     | Higher fuzzy score on an alias                                                         |
| `Tag match`                             | More matching tags                                                                     |
| `Match coverage`                        | More matched characters across name, path, aliases, tags and keywords (best OR branch) |
| `Folder path match`                     | Higher fuzzy score on the folder portion of the path                                   |
| `Lower prior folders`                   | Pushes notes in the configured folders down (see below)                                |
| `Activity`                              | Recently opened first; ties broken by persistent palette usage                         |
| `Last modified`                         | Newest modification time                                                               |
| `Aliases count`                         | More aliases                                                                           |
| `Alphabetical` / `Alphabetical reverse` | Name, then path, ascending / descending                                                |
| `@prior` / `@prior:asc`                 | Smaller numeric `prior` in frontmatter                                                 |
| `@prior:desc`                           | Larger numeric `prior` in frontmatter                                                  |

Notes without a `prior` sort last. Complete contiguous matches on a name, path, alias, tag or keyword always beat fuzzy-only matches before this list is applied.

`Lower prior folders` takes one folder path per line (subfolders included). Enable the criterion in `Sort priorities` to rank those notes lower even without `@prior`, and move it above name or activity criteria to give demotion precedence. Include-ignored preference still runs first.

## Settings

Settings are split into three pages: the palette itself (prefixes, search history, debug messages), Vault file search (excluded folders, ignored-note index, sort priorities) and Everything.

### Everything setup

1. Install Everything 1.5a and the official HTTP Server plugin, and start both.
2. Under `Settings → My Palette → Everything`, set the HTTP server URL (and username / password if you set them) and press `Test connection`.

Only localhost communication is used; My Palette sends nothing to external services.

### Search history

Search history and recently run command IDs are stored per Vault in local IndexedDB. `data.json` is used only as a fallback when IndexedDB is unavailable.

## Installation

The plugin is not in the community plugin list yet. To install it manually, copy `main.js`, `styles.css` and `manifest.json` from a release into `VaultFolder/.obsidian/plugins/my-palette/`, then enable My Palette in Obsidian's settings.

## Development

Building requires the [Vite+](https://viteplus.dev/guide/) CLI (`vp`). See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the build, test and release workflow.
