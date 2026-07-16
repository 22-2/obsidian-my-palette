import {
	App,
	FuzzySuggestModal,
	Modal,
	Notice,
	Plugin,
	TFile,
	openWithDefaultApp,
	showInFolder,
} from "obsidian";
import { execFile, type ChildProcess } from "child_process";
import log, { LogLevels } from "consola";
import {
	DEFAULT_SETTINGS,
	mergeSettings,
	MyPaletteSettingTab,
	type MyPaletteSettings,
} from "./settings";
import "./styles.css";

type PaletteMode = "file" | "command" | "everything";

interface PaletteResult {
	id: string;
	mode: PaletteMode;
	primary: string;
	secondary: string;
	icon: string;
	file?: TFile;
	commandId?: string;
	absolutePath?: string;
	kind?: "file" | "folder";
}

interface EsResult {
	absolutePath: string;
	attributes: string;
	kind: "file" | "folder";
}

const logger = log.withTag("MyPalette");

export default class MyPalettePlugin extends Plugin {
	settings: MyPaletteSettings = DEFAULT_SETTINGS;
	private activeEsProcess: ChildProcess | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.initializeLogger();
		this.addSettingTab(new MyPaletteSettingTab(this));
		this.addCommand({
			id: "open",
			name: "Open palette",
			callback: () => new MyPaletteModal(this.app, this).open(),
		});
	}

	onunload(): void {
		this.activeEsProcess?.kill();
		this.activeEsProcess = null;
		logger.debug("Plugin unloaded");
	}

	initializeLogger(): void {
		logger.level = this.settings.showLog ? LogLevels.debug : LogLevels.error;
	}

	async loadSettings(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async testEverythingConnection(): Promise<{ ok: boolean; message: string }> {
		try {
			await this.searchEverything("__my_palette_connection_test__", 1);
			return { ok: true, message: "Everything connection succeeded." };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	async searchEverything(
		query: string,
		limit = this.settings.everything.maxResults,
	): Promise<EsResult[]> {
		const esPath = this.settings.everything.esPath.trim();
		if (!esPath) throw new Error("Set the es.exe path in My Palette settings.");
		const args = [
			"-instance",
			this.settings.everything.instanceName,
			"-n",
			String(Math.min(500, Math.max(1, limit))),
			"-csv",
			"-no-header",
			"-full-path-and-name",
			"-attributes",
			"-cp",
			"65001",
			"-timeout",
			String(this.settings.everything.esTimeoutMs),
			"--",
			query,
		];
		logger.debug("Running es.exe", esPath, args);
		return await new Promise<EsResult[]>((resolve, reject) => {
			const child = execFile(
				esPath,
				args,
				{
					windowsHide: true,
					shell: false,
					timeout: this.settings.everything.processTimeoutMs,
					maxBuffer: 1024 * 1024,
					encoding: "utf8",
				},
				(error, stdout, stderr) => {
					if (this.activeEsProcess === child) this.activeEsProcess = null;
					if (error) {
						const code =
							typeof (error as NodeJS.ErrnoException).code === "number"
								? (error as NodeJS.ErrnoException).code
								: undefined;
						if (code === 8)
							reject(
								new Error(
									"Everything 1.5a is not running or the instance name is wrong.",
								),
							);
						else if ((error as NodeJS.ErrnoException).code === "ENOENT")
							reject(new Error("es.exe was not found."));
						else if ((error as NodeJS.ErrnoException).killed)
							reject(new Error("Everything search timed out."));
						else reject(new Error(stderr.trim() || error.message));
						return;
					}
					resolve(parseEsCsv(stdout));
				},
			);
			this.activeEsProcess?.kill();
			this.activeEsProcess = child;
		});
	}
}

class MyPaletteModal extends Modal {
	private readonly plugin: MyPalettePlugin;
	private input!: HTMLInputElement;
	private resultsEl!: HTMLElement;
	private statusEl!: HTMLElement;
	private modeEl!: HTMLElement;
	private results: PaletteResult[] = [];
	private selectedIndex = 0;
	private generation = 0;
	private debounceTimer: number | undefined;
	private mode: PaletteMode = "file";

	constructor(app: App, plugin: MyPalettePlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		this.modalEl.addClass("my-palette-modal");
		this.contentEl.empty();

		const header = this.contentEl.createDiv("my-palette-header");
		this.modeEl = header.createDiv("my-palette-mode");
		this.input = header.createEl("input", {
			type: "text",
			cls: "my-palette-input",
			attr: { placeholder: "Search files, > commands, or e Everything" },
		});
		this.resultsEl = this.contentEl.createDiv("my-palette-results");
		this.statusEl = this.contentEl.createDiv("my-palette-status");

		this.input.addEventListener("input", () => this.scheduleSearch());
		this.input.addEventListener("keydown", (event) => this.handleKeydown(event));
		window.setTimeout(() => this.input.focus(), 0);
		this.scheduleSearch();
	}

	onClose(): void {
		if (this.debounceTimer !== undefined) window.clearTimeout(this.debounceTimer);
		this.plugin.activeEsProcess?.kill();
		this.plugin.activeEsProcess = null;
		this.contentEl.empty();
	}

	private handleKeydown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (event.key === "ArrowDown") {
			event.preventDefault();
			this.selectedIndex = this.results.length
				? (this.selectedIndex + 1) % this.results.length
				: 0;
			this.renderResults();
		} else if (event.key === "ArrowUp") {
			event.preventDefault();
			this.selectedIndex = this.results.length
				? (this.selectedIndex - 1 + this.results.length) % this.results.length
				: 0;
			this.renderResults();
		} else if (event.key === "Enter") {
			event.preventDefault();
			void this.activate(event.ctrlKey && event.shiftKey ? 2 : event.ctrlKey ? 1 : 0);
		}
	}

	private scheduleSearch(): void {
		if (this.debounceTimer !== undefined) window.clearTimeout(this.debounceTimer);
		this.debounceTimer = window.setTimeout(
			() => void this.search(),
			this.plugin.settings.everything.debounceMs,
		);
	}

	private parseInput(): { mode: PaletteMode; query: string } {
		const raw = this.input.value;
		const everythingPrefix = this.plugin.settings.prefixes.everything;
		const commandPrefix = this.plugin.settings.prefixes.command;
		if (
			everythingPrefix &&
			raw.slice(0, everythingPrefix.length).toLowerCase() === everythingPrefix.toLowerCase()
		) {
			return {
				mode: "everything",
				query: raw.slice(everythingPrefix.length).replace(/^\s+/, ""),
			};
		}
		if (commandPrefix && raw.slice(0, commandPrefix.length) === commandPrefix) {
			return { mode: "command", query: raw.slice(commandPrefix.length).replace(/^\s+/, "") };
		}
		return { mode: "file", query: raw };
	}

	private async search(): Promise<void> {
		const currentGeneration = ++this.generation;
		const parsed = this.parseInput();
		this.mode = parsed.mode;
		this.modeEl.setTextContent(
			parsed.mode === "file"
				? "Files"
				: parsed.mode === "command"
					? "Commands"
					: "Everything",
		);
		this.statusEl.setTextContent(
			parsed.mode === "everything" && !parsed.query ? "Type a search query" : "Searching…",
		);

		try {
			let next: PaletteResult[];
			if (parsed.mode === "file") next = this.searchFiles(parsed.query);
			else if (parsed.mode === "command") next = this.searchCommands(parsed.query);
			else if (!parsed.query) next = [];
			else {
				const external = await this.plugin.searchEverything(parsed.query);
				next = external.map((item) => ({
					id: item.absolutePath.toLowerCase(),
					mode: "everything",
					primary: item.absolutePath.split(/[\\/]/).pop() || item.absolutePath,
					secondary: item.absolutePath,
					icon: item.kind === "folder" ? "📁" : "📄",
					absolutePath: item.absolutePath,
					kind: item.kind,
				}));
			}
			if (currentGeneration !== this.generation) return;
			this.results = next;
			this.selectedIndex = 0;
			this.renderResults();
		} catch (error) {
			if (currentGeneration !== this.generation) return;
			this.results = [];
			this.renderResults();
			this.statusEl.setTextContent(error instanceof Error ? error.message : String(error));
		}
	}

	private searchFiles(query: string): PaletteResult[] {
		const files = this.app.vault.getMarkdownFiles();
		const recent = new Map<string, number>();
		const recentPaths =
			(
				this.app.workspace as unknown as { getLastOpenFiles?: () => string[] }
			).getLastOpenFiles?.() ?? [];
		recentPaths.forEach((path, index) => recent.set(path, index));
		const normalized = query.trim().toLocaleLowerCase();
		return files
			.map((file) => {
				const haystack = `${file.basename} ${file.path}`.toLocaleLowerCase();
				const score = !normalized
					? recent.get(file.path) !== undefined
						? 1000 - (recent.get(file.path) ?? 0)
						: 0
					: haystack.includes(normalized)
						? file.basename.toLocaleLowerCase().startsWith(normalized)
							? 500
							: 250
						: -1;
				return { file, score };
			})
			.filter((item) => item.score >= 0)
			.sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
			.slice(0, 50)
			.map(({ file }) => ({
				id: file.path,
				mode: "file",
				primary: file.basename,
				secondary: file.path,
				icon: "📄",
				file,
			}));
	}

	private searchCommands(query: string): PaletteResult[] {
		const commands = Object.values(
			(
				this.app.commands as unknown as {
					commands: Record<string, { id: string; name: string }>;
				}
			).commands ?? {},
		);
		const normalized = query.toLocaleLowerCase();
		return commands
			.map((command) => ({
				command,
				score: !normalized
					? 0
					: command.name.toLocaleLowerCase().includes(normalized)
						? command.name.toLocaleLowerCase().startsWith(normalized)
							? 500
							: 250
						: -1,
			}))
			.filter((item) => item.score >= 0)
			.sort((a, b) => b.score - a.score || a.command.name.localeCompare(b.command.name))
			.slice(0, 50)
			.map(({ command }) => ({
				id: command.id,
				mode: "command",
				primary: command.name,
				secondary: command.id,
				icon: "⌘",
				commandId: command.id,
			}));
	}

	private renderResults(): void {
		this.resultsEl.empty();
		this.results.forEach((result, index) => {
			const row = this.resultsEl.createDiv({
				cls: "my-palette-result",
				attr: { role: "option", "aria-selected": String(index === this.selectedIndex) },
			});
			if (index === this.selectedIndex) row.addClass("is-selected");
			row.createSpan({ cls: "my-palette-result-icon", text: result.icon });
			const text = row.createDiv("my-palette-result-text");
			text.createDiv({ cls: "my-palette-result-primary", text: result.primary });
			text.createDiv({ cls: "my-palette-result-secondary", text: result.secondary });
			row.addEventListener("mouseenter", () => {
				this.selectedIndex = index;
				this.renderResults();
			});
			row.addEventListener("click", () => void this.activate(0));
		});
		this.statusEl.setTextContent(
			this.results.length
				? `${this.results.length} result${this.results.length === 1 ? "" : "s"}`
				: "No results",
		);
	}

	private async activate(action: number): Promise<void> {
		const result = this.results[this.selectedIndex];
		if (!result) return;
		if (result.mode === "file" && result.file) {
			this.close();
			const leaf =
				action === 1
					? this.app.workspace.getLeaf("tab")
					: action === 2
						? this.app.workspace.getLeaf("split")
						: this.app.workspace.getLeaf(false);
			await leaf.openFile(result.file);
		} else if (result.mode === "command" && result.commandId) {
			this.close();
			(
				this.app.commands as unknown as { executeCommandById: (id: string) => boolean }
			).executeCommandById(result.commandId);
			this.plugin.settings.recentCommandIds = [
				result.commandId,
				...this.plugin.settings.recentCommandIds.filter((id) => id !== result.commandId),
			].slice(0, 20);
			await this.plugin.saveSettings();
		} else if (result.mode === "everything" && result.absolutePath) {
			this.close();
			if (action === 1) showInFolder(result.absolutePath);
			else if (action === 2) {
				const editor = this.app.workspace.activeEditor?.editor;
				if (editor) editor.replaceSelection(result.absolutePath);
				else new Notice("No active editor to insert the path.");
			} else openWithDefaultApp(result.absolutePath);
		}
	}
}

export function parseEsCsv(input: string): EsResult[] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		if (quoted) {
			if (char === '"' && input[index + 1] === '"') {
				cell += '"';
				index += 1;
			} else if (char === '"') quoted = false;
			else cell += char;
		} else if (char === '"' && cell.length === 0) quoted = true;
		else if (char === ",") {
			row.push(cell);
			cell = "";
		} else if (char === "\n" || char === "\r") {
			if (char === "\r" && input[index + 1] === "\n") index += 1;
			row.push(cell);
			cell = "";
			if (row.some((value) => value.length > 0)) rows.push(row);
			row = [];
		} else cell += char;
	}
	if (cell.length || row.length) {
		row.push(cell);
		rows.push(row);
	}
	return rows
		.filter(
			(row) => row.length >= 2 && /^[A-Za-z]:[\\/]/.test(row[0]) && !row[0].includes("\0"),
		)
		.map((row) => ({
			absolutePath: row[0],
			attributes: row[1],
			kind: row[1].toUpperCase().includes("D") ? "folder" : "file",
		}));
}
