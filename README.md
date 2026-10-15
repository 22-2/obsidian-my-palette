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
- **Three surfaces**: the modal Palette, the Sidebar palette in the right sidebar, and the sortable Table palette in a center tab.
- **Obsidian-excluded files on demand**: files hidden by Obsidian's Excluded files setting stay out of the way until you turn on the `Obsidian-excluded` switch (`Ctrl+I`).
- Desktop only (Windows is the primary target).

## Getting started

Open the command palette and run one of these, then bind a hotkey if you like:

| Command                                   | What it does                                                |
| ----------------------------------------- | ----------------------------------------------------------- |
| `My Palette: Open home`                   | Home: modes above recently used files                       |
| `My Palette: Open note list`              | Starts in the Notes mode                                    |
| `My Palette: Open run list`               | Starts in the Commands mode                                 |
| `My Palette: Open sidebar palette`        | Sidebar palette: a persistent list view                     |
| `My Palette: Open table palette`          | Table palette: a persistent table in a center tab           |
| `My Palette: Open outgoing link list`     | Notes linked from the current note                          |
| `My Palette: Open backlink list`          | Notes linking to the current note                           |
| `My Palette: Open bookmark list`          | Saved bookmarks                                             |
| `My Palette: Open Smart Connections list` | Notes related to the current note (needs Smart Connections) |
| `My Palette: Open tab list`               | Open tabs                                                   |
| `My Palette: Open folder move selector`   | Move the current file                                       |
| `My Palette: Open rename selector`        | Rename the current file                                     |
| `My Palette: Open tag insert selector`    | Add tags to the current note                                |
| `My Palette: Open MOC insert selector`    | Add mutual Relateds links to the active MOC                 |
| `My Palette: Open MOC remove selector`    | Remove Relateds links from the active MOC                   |

## Using the palette

### Mouse and keyboard

Palette lists and tables keep the first result highlighted while you type, so `Enter` runs it right away and `↑`/`↓` move through results. Tag and MOC insertion add separate input and selection modes (see below) because `Space` checks candidates there.

The action (`…`) and history (clock) buttons are also available in the Tag insert selector, the MOC insert and remove selectors, and the Folder move selector. Actions and Help describe the current selector. Each selector has its own search history; selecting an entry restores only the query and never inserts tags, adds links or moves a file. `Ctrl+R` opens history, and the history enablement, delay and retention settings apply to these selectors too. Highlighting uses the shared modal display preference.

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

The action menu offers: open, open in a background tab, open side by side, open below, open in external editor, show in system explorer, open in terminal, copy file names, Vault-relative paths or absolute paths, rename (`Rename…`), move to another folder (`Move to…`; every selected file moves at once; Obsidian-excluded Markdown notes are imported into the vault first), insert into a MOC and add tags. The palette's menu button also has a `Help` entry that lists the prefixes and gestures for the current palette. The palette modal's footer shows the `Obsidian-excluded` switch; other keyboard instructions and insertion targets live in Help. Hold `Alt+H` in any search or interaction mode to gently fade out the palette or selector while inspecting a preview; releasing either key fades it back in and returns focus to the search field. This works in modals (including their backdrop), Sidebar palettes and Table palettes, preserving the query, selection and workspace layout. In a mode, `Esc` returns to Home. At Home, `Esc` closes a modal; in a persistent view it clears the query, then focuses the search field.

### Custom shortcuts

Open **Settings → My Palette → Shortcuts** to see every palette and selector shortcut in one table, sorted by where each one works: the command, its keybinding, a dot for each place it works (Palette, File search, Tag, MOC +, MOC −) and a Reset button. A shortcut that works in every palette and selector says so in one cell. Filter the table by command, keybinding or place. Click a keybinding and press the new shortcut; **Escape** cancels, and **Backspace** or **Delete** turns the shortcut off. A conflict appears under its row, and **Reset** appears only for a changed binding. Changes are saved and apply immediately to open palettes and selectors. Keys that would type text in the input are rejected unless the shortcut is one that does not type, such as Tab for Enter mode. Arrow keys, Enter and Escape keep their standard behavior. Hotkeys for opening palettes remain available in Obsidian's own **Settings → Hotkeys**.

### Search modes

`My Palette: Open home` starts at Home, which lists the modes above your files, much like Raycast. Pick a mode with `Enter` or `Tab`, or type its alias followed by a space. The alias then leaves the input and shows as a chip on its left, so the input holds only the query. `Esc` (or `Backspace` in an empty input, or a click on the chip) goes back to Home with the alias selected, so `Enter` re-enters the mode. `Esc` at Home closes the palette.

Between Modes and Files, Home's **Settings** section lists **General**, **Modes**, **File search**, **Shortcuts**, and **Integration**. Click a row or choose it with Enter or Tab to open that settings page directly. Typing a page name or `settings` filters these entries.

| Alias | Mode           | Purpose                                                                 |
| ----- | -------------- | ----------------------------------------------------------------------- |
| none  | Files          | Search files in the Vault                                               |
| `n`   | Notes          | Enter the built-in Obsidian file search from Home                       |
| `>`   | Commands       | Search and run Obsidian commands                                        |
| `e`   | Everything     | Search vault files; turn Obsidian-excluded on to search every file type |
| `o`   | Outgoing links | Notes linked from the current note                                      |
| `b`   | Backlinks      | Notes linking to the current note                                       |
| `bk`  | Bookmarks      | Search saved bookmarks                                                  |
| `sc`  | Related notes  | Notes related to the current note (Smart Connections)                   |
| `t`   | Tabs           | Switch to an open tab                                                   |
| `p`   | Plugins        | Open installed plugin folders in an external editor                     |
| `sn`  | Snippets       | Open CSS snippets in an external editor                                 |
| `pr`  | Properties     | Find and edit the properties of the current note                        |

Plugins lists every installed plugin by name, with disabled ones marked; Snippets lists the snippets folder first, then each snippet with its enabled state. `Enter` opens the folder or file in the external editor (VS Code for now). The menu also offers show in system explorer and open in terminal, plus path copying. Plugin rows with a settings tab offer open plugin settings.

Properties lists the current note's properties under **This note**, the reserved `aliases`, `tags` and `cssclasses` under **Reserved**, and the other keys used in the vault under **Vault**. `Enter` edits a value by its type: tags open the tag insert selector, lists open a selector of their values, checkboxes flip in place, and text, number, date and date-time values are typed into an input. Typing a key that nothing matches offers to add it, after choosing a type. Nested values are edited in source mode. The menu also offers copy value, delete property and copy property name. The type is read from the vault and never changed from here.

Every alias can be changed, and a mode can be turned off, in **Settings → My Palette → Modes**. Turning off a mode, or its integration in **Integrations**, removes it from Home and from alias entry. The Table palette does not list modes but still enters them by alias. Commands that open a mode directly, such as `Open note list` or `Open backlink list`, start in that mode; `Esc` returns to Home.

Integration modes appear only after their setup is ready. Everything checks its HTTP connection in the background; Smart Connections needs an enabled plugin with an initialized source store and vector adapter. Unready integrations are hidden from Home and the Modes settings page. Correct the connection settings or use **Test connection** in Integrations to make Everything available again.

The `Obsidian-excluded` switch at the left of the footer (`Ctrl+I`) includes files hidden by Obsidian's Excluded files setting. It applies to Home, Notes, and Everything, and is hidden in other modes. In Everything it also removes the extension filter, searching every file type under the Vault folder. Search history remembers the scope and restoring an entry sets the switch.

### Search syntax

Outside Everything mode, separate terms with spaces for AND and use `|` for OR. For example, `meeting project | agenda` matches notes containing both `meeting` and `project`, or notes containing `agenda`.

File search covers inline tags and frontmatter `tags`. `#project` searches tags directly, and ordinary terms can match tags too. Matching tags appear under the file name (up to three, then `+N`); hover a row to see all of them.

Frontmatter `keywords` is also searchable as a string array (for example, `keywords: [astronomy, stargazing]`), including in Obsidian-excluded files searched with the `Obsidian-excluded` switch. Matching keywords appear beside matching tags without a `#`, with up to three chips in total followed by `+N`. Hover the chips to see all matches. Hash-prefixed tag-only queries search tags only.

Everything queries are passed through unchanged and use Everything's own syntax. Everything mode needs Everything 1.5a with the official HTTP Server plugin running. See [Everything setup](#everything-setup).

## Working with several notes

Selection is shared by the palette, the Tag insert selector and the MOC insert and remove selectors: click, `Ctrl`/`Shift`+click, arrow keys.

When a modal palette's menu opens a selector (`Add tags…`, `Move to…`, `Rename…`) or a property editor, the palette stays open underneath. Cancelling the selector with `Esc` returns to the palette as it was; it closes only after the action has been applied.

### Adding tags

Run `Open tag insert selector`, or right-click results and choose `Add tags…`. With several results selected, the tags are added to every selected Markdown note. Obsidian-excluded files are skipped.

- Candidates are ordered as recently inserted tags, tags used by linked notes (up to 10, marked `Related N`), then usage count.
- Tags that every target already has appear last as `Registered` and cannot be chosen. Tags only some targets have show `On N/M notes` and stay selectable.
- Start in input mode, where Space is part of the search query. `↑`/`↓` or clicking a result switches to selection mode; `f` or clicking the input returns to input mode.
- Checked tags always appear first, including new tags, even when they do not match the query. Unchecking returns them to the normal search results.
- `→` previews the highlighted tag in Obsidian's core Search without moving focus away from the modal. In input mode the cursor must be at the end of the query; in selection mode the shortcut works anywhere.
- In selection mode, check rows with `Space`, the context menu or the check icon (which toggles only its row). `Enter` (including numpad Enter) or double-click applies highlighted rows immediately: a tag the note lacks is added, and a tag that every target already has is removed. Tags every target already has start checked; clearing such a check marks it for removal. `Ctrl+Enter` applies every pending change at once, adding checked tags and removing cleared ones. The context menu's `Add N now` runs the checked and highlighted rows at once.
- The button at the right end of the input lists the checked rows, lets you uncheck them and runs them.
- Typing a tag that does not exist offers it as a new tag.
- Right-click a registered or partly applied tag and choose `Remove tag` to remove it from the target notes; inside a multi-row selection it removes every selected tag.

Recently inserted tags are stored per Vault in local IndexedDB.

### Inserting into a MOC

The MOC insert selector uses the same input/selection modes and gestures. Checked notes always appear first regardless of the query. `→` previews the highlighted note while keeping the modal focused. `Enter` inserts highlighted notes immediately; `Space` toggles checks in selection mode, and `Ctrl+Enter` or the checked-list button adds mutual `Relateds` links to the original MOC for every checked note, even after previewing another note. Notes already linked in both directions start checked; clearing their check unlinks them when you press `Ctrl+Enter`, and `Enter` unlinks the highlighted one at once. Only links inside a `Relateds` item count, not other links in the body.

Notes linked in both directions appear last and cannot be selected. Notes linked in one direction stay selectable so you can complete the link. Right-click a linked note and choose `Remove link` to remove the Relateds links in both directions.

### Renaming files

Select files in a palette, right-click and choose `Rename…` (or run `Open rename selector` for the current file). Type `find/replace` in the input and the list previews every new name: for example `_/-` turns `2026_01_02.md` into `2026-01-02.md`, and `draft/` deletes the word. A file name cannot contain `/`, so the first `/` separates the two parts and nothing needs escaping. The footer switches choose `Regex` (the find part is a regular expression and `$1` inserts a group, so it cannot contain `/`), `Match case` and `All occurrences`.

Only the name of files inside the vault changes; folders, extensions and Obsidian-excluded or external files are never renamed. Rows are marked when a name is invalid, already exists or would be given to two files, and nothing is renamed until every mark is resolved. `Enter` only reminds you of the shortcut; `Ctrl+Enter` renames every listed file whose name changes. Links to the files are updated by Obsidian.

## Views

`Open sidebar palette` opens the Sidebar palette and `Open table palette` opens the Table palette in a center tab. Each command reuses its own pane without replacing the other, and each pane can be duplicated from its pane menu.

In the Table palette:

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

Settings are split into five pages: **General** (Return to Home after, search history, highlighting and diagnostics), **Modes** (each mode's alias and switch), **File search** (file types, excluded folders, Obsidian-excluded index, sort priorities), **Shortcuts** (the table described above) and **Integrations** (Everything, Smart Connections and VS Code).

### Everything setup

1. Install Everything 1.5a and the official HTTP Server plugin, and start both.
2. Under `Settings → My Palette → Integrations`, click **Everything** to expand its settings, then set the HTTP server URL (and username / password if you set them) and press `Test connection`.

Only localhost communication is used; My Palette sends nothing to external services.

### Return to Home after

`Open home` resumes the palette you closed last: its query with the mode alias, the Obsidian-excluded switch, the selected row and the scroll position. It does so only when you come back within the time set by **Settings → My Palette → General → Return to Home after** (Immediately, 30, 60 or 90 seconds; 90 by default), and otherwise starts at Home. The resumed query is selected, so typing replaces it. This state is kept in memory only, so restarting Obsidian starts at Home.

### Search history

Search history and recently run command IDs are stored per Vault in local IndexedDB. `data.json` is used only as a fallback when IndexedDB is unavailable.

## Installation

The plugin is not in the community plugin list yet. To install it manually, copy `main.js`, `styles.css` and `manifest.json` from a release into `VaultFolder/.obsidian/plugins/my-palette/`, then enable My Palette in Obsidian's settings.

## Development

Building requires Node.js and pnpm. See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the build, test and release workflow.
