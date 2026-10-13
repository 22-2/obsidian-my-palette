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

Other sources (commands, Everything, bookmarks, …) are modes one step away from Home (the palette before a mode is entered), not the main way to operate the palette.

## Features

- **Vault file search** with AND / OR terms, aliases, frontmatter `keywords`, frontmatter and inline tags, and fully configurable sort priorities.
- **Everything 1.5a search** for files outside the Vault, opened in Obsidian (Markdown) or in the OS default app.
- **Command, bookmark, link, backlink and Smart Connections search** in the same window.
- **Multi-select** with the same gestures as a file manager, then copy paths, add tags or insert MOC links to all selected notes at once.
- **Three surfaces**: a modal, a list view in the right sidebar, and a sortable table view in a center tab.
- **Excluded files on demand**: notes hidden by Obsidian's excluded folders stay out of the way until you turn on the `Ignored` switch (`Ctrl+I`).
- Desktop only (Windows is the primary target).

## Getting started

Open the command palette and run one of these, then bind a hotkey if you like:

| Command                                       | What it does                                                |
| --------------------------------------------- | ----------------------------------------------------------- |
| `My Palette: Open palette`                    | Home: modes above recently used files                       |
| `My Palette: Open recent palette`             | File search only, starting from recently used files         |
| `My Palette: Open run list`                   | Starts in the Run Command mode                              |
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
| `Esc`                  | Leave a mode; at Home, close or clear              |

The action menu offers: open, open in a background tab, open side by side, open below, show in file explorer (Everything results), copy file names, Vault-relative paths or absolute paths, insert into a MOC and add tags. The palette's menu button also has a `Help` entry that lists the prefixes and gestures for the current picker. The palette modal's footer shows the `Ignored` switch; other keyboard instructions and insertion targets live in Help. Hold `Alt+H` in any search or interaction mode to gently fade out the palette or selector while inspecting a preview; releasing either key fades it back in and returns focus to the search field. This works in modals (including their backdrop), sidebar palettes and table views, preserving the query, selection and workspace layout. In a mode, `Esc` returns to Home. At Home, `Esc` closes a modal; in a persistent view it clears the query, then focuses the search field.

### Custom shortcuts

Open **Settings → My Palette → Shortcuts** to see every palette and selector shortcut in one table: the command, its keybinding, where it works and a Reset button. Filter the table by command, keybinding or place. Click a keybinding and press the new shortcut; **Escape** cancels, and **Backspace** or **Delete** turns the shortcut off. A conflict appears under its row, and **Reset** appears only for a changed binding. Changes are saved and apply immediately to open palettes and selectors. Keys that would type text in the input are rejected unless the shortcut is one that does not type, such as Tab for Enter mode. Arrow keys, Enter and Escape keep their standard behavior. Hotkeys for opening palettes remain available in Obsidian's own **Settings → Hotkeys**.

### Search modes

`My Palette: Open palette` starts at Home, which lists the modes above your files, much like Raycast. Pick a mode with `Enter` or `Tab`, or type its alias followed by a space. The alias then leaves the input and shows as a chip on its left, so the input holds only the query. `Esc` (or `Backspace` in an empty input, or a click on the chip) goes back to Home with the alias selected, so `Enter` re-enters the mode. `Esc` at Home closes the palette.

| Alias   | Mode                      | Purpose                                                  |
| ------- | ------------------------- | -------------------------------------------------------- |
| none    | Files                     | Search files in the Vault                                |
| `>`     | Run Command               | Search and run Obsidian commands                         |
| `e`     | Search Vault Notes        | Search the Vault's file types with Everything            |
| `esdir` | Search All Files in Vault | Search every file under the Vault folder with Everything |
| `o`     | Search Outgoing Links     | Notes linked from the current note                       |
| `b`     | Search Backlinks          | Notes linking to the current note                        |
| `bk`    | Search Bookmarks          | Search saved bookmarks                                   |
| `sc`    | Search Related Notes      | Notes related to the current note (Smart Connections)    |
| `t`     | Switch Tab                | Switch to an open tab                                    |

Every alias can be changed, and a mode can be turned off, in **Settings → My Palette → Modes**. Turning off a mode, or its integration in **Integrations**, removes it from Home and from alias entry. `Open recent palette` and the table view do not list modes but still enter them by alias. Commands that open a mode directly, such as `Open run list` or `Backlink search`, start in that mode; `Esc` returns to Home.

The `Ignored` switch at the left of the footer (`Ctrl+I`) includes files hidden by Obsidian's excluded folders. It applies to file search only and stays dimmed in other modes. Search history remembers whether a search included them, and restoring an entry sets the switch.

### Search syntax

Outside Everything mode, separate terms with spaces for AND and use `|` for OR. For example, `meeting project | agenda` matches notes containing both `meeting` and `project`, or notes containing `agenda`.

File search covers inline tags and frontmatter `tags`. `#project` searches tags directly, and ordinary terms can match tags too. Matching tags appear under the file name (up to three, then `+N`); hover a row to see all of them.

Frontmatter `keywords` is also searchable as a string array (for example, `keywords: [astronomy, stargazing]`), including in excluded notes searched with the `Ignored` switch. Matching keywords appear beside matching tags without a `#`, with up to three chips in total followed by `+N`. Hover the chips to see all matches. Hash-prefixed tag-only queries search tags only.

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

Settings are split into five pages: **General** (Return to Home after, search history, highlighting and diagnostics), **Modes** (each mode's alias and switch), **File search** (file types, excluded folders, ignored-note index, sort priorities), **Shortcuts** (the table described above) and **Integrations** (Everything, Smart Connections and VS Code).

### Everything setup

1. Install Everything 1.5a and the official HTTP Server plugin, and start both.
2. Under `Settings → My Palette → Integrations`, click **Everything** to open its settings, then set the HTTP server URL (and username / password if you set them) and press `Test connection`.

Only localhost communication is used; My Palette sends nothing to external services.

### Return to Home after

`Open palette` resumes the palette you closed last: its query with the mode alias, the Ignored switch, the selected row and the scroll position. It does so only when you come back within the time set by **Settings → My Palette → General → Return to Home after** (Immediately, 30, 60 or 90 seconds; 90 by default), and otherwise starts at Home. The resumed query is selected, so typing replaces it. This state is kept in memory only, so restarting Obsidian starts at Home.

### Search history

Search history and recently run command IDs are stored per Vault in local IndexedDB. `data.json` is used only as a fallback when IndexedDB is unavailable.

## Installation

The plugin is not in the community plugin list yet. To install it manually, copy `main.js`, `styles.css` and `manifest.json` from a release into `VaultFolder/.obsidian/plugins/my-palette/`, then enable My Palette in Obsidian's settings.

## Development

Building requires Node.js and pnpm. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the build, test and release workflow.
