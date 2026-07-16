import { PluginSettingTab, Setting, Notice } from "obsidian";
import type MyPalettePlugin from "./main";
import {
	type MyPaletteSettings,
	DEFAULT_KEYBINDINGS,
	type ActionId,
	ACTION_IDS,
} from "./model/settings";

export type { MyPaletteSettings };

export const DEFAULT_SETTINGS: MyPaletteSettings = {
	schemaVersion: 1,
	showLog: false,
	prefixes: { command: ">", everything: "e " },
	everything: {
		esPath: "",
		instanceName: "1.5a",
		maxResults: 100,
		debounceMs: 150,
		esTimeoutMs: 3000,
		processTimeoutMs: 5000,
	},
	keybindings: structuredClone(DEFAULT_KEYBINDINGS),
	recentCommandIds: [],
};

function bounded(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, Math.round(value)))
		: fallback;
}

export function mergeSettings(data: unknown): MyPaletteSettings {
	const source = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const rawPrefixes = (source.prefixes ?? {}) as Record<string, unknown>;
	const rawEverything = (source.everything ?? {}) as Record<string, unknown>;

	return {
		...DEFAULT_SETTINGS,
		showLog: typeof source.showLog === "boolean" ? source.showLog : false,
		prefixes: {
			command: typeof rawPrefixes.command === "string" ? rawPrefixes.command : ">",
			everything: typeof rawPrefixes.everything === "string" ? rawPrefixes.everything : "e ",
		},
		everything: {
			esPath: typeof rawEverything.esPath === "string" ? rawEverything.esPath : "",
			instanceName:
				typeof rawEverything.instanceName === "string" && rawEverything.instanceName.trim()
					? rawEverything.instanceName.trim()
					: "1.5a",
			maxResults: bounded(rawEverything.maxResults, 100, 10, 500),
			debounceMs: bounded(rawEverything.debounceMs, 150, 50, 1000),
			esTimeoutMs: bounded(rawEverything.esTimeoutMs, 3000, 500, 10000),
			processTimeoutMs: bounded(rawEverything.processTimeoutMs, 5000, 500, 15000),
		},
		keybindings: mergeKeybindings(source.keybindings),
		recentCommandIds: Array.isArray(source.recentCommandIds)
			? source.recentCommandIds
					.filter((id): id is string => typeof id === "string")
					.slice(0, 20)
			: [],
	};
}

function mergeKeybindings(raw: unknown): Record<ActionId, string[]> {
	const defaults = structuredClone(DEFAULT_KEYBINDINGS);
	if (!raw || typeof raw !== "object") return defaults;
	const obj = raw as Record<string, unknown>;
	for (const action of ACTION_IDS) {
		const value = obj[action];
		if (Array.isArray(value)) {
			defaults[action] = value.filter((v): v is string => typeof v === "string");
		}
	}
	return defaults;
}

export class MyPaletteSettingTab extends PluginSettingTab {
	constructor(public plugin: MyPalettePlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName("My Palette").setHeading();

		new Setting(containerEl)
			.setName("es.exe path")
			.setDesc("Absolute path to voidtools es.exe")
			.addText((text) =>
				text
					.setPlaceholder("C:\\Program Files\\Everything 1.5a\\es.exe")
					.setValue(this.plugin.settings.everything.esPath)
					.onChange(async (value) => {
						this.plugin.settings.everything.esPath = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Everything instance")
			.setDesc("Named instance used by es.exe")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.everything.instanceName)
					.onChange(async (value) => {
						this.plugin.settings.everything.instanceName = value.trim() || "1.5a";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("Maximum Everything results").addSlider((slider) =>
			slider
				.setLimits(10, 500, 10)
				.setValue(this.plugin.settings.everything.maxResults)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.everything.maxResults = value;
					await this.plugin.saveSettings();
				}),
		);

		new Setting(containerEl)
			.setName("Test Everything connection")
			.setDesc("Runs a harmless query against the configured instance")
			.addButton((button) =>
				button.setButtonText("Test").onClick(async () => {
					const result = await this.plugin.testEverythingConnection();
					new Notice(result.ok ? result.message : `Everything: ${result.message}`);
				}),
			);

		new Setting(containerEl).setName("Prefixes").setHeading();
		this.addPrefix(containerEl, "Command prefix", "command");
		this.addPrefix(containerEl, "Everything prefix", "everything");

		new Setting(containerEl).setName("Keybindings").setHeading();
		for (const action of ACTION_IDS) {
			this.addKeybinding(containerEl, action);
		}

		new Setting(containerEl).setName("Developer").setHeading();
		new Setting(containerEl).setName("Show debug messages").addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.showLog).onChange(async (value) => {
				this.plugin.settings.showLog = value;
				await this.plugin.saveSettings();
				this.plugin.initializeLogger();
			}),
		);
	}

	private addPrefix(containerEl: HTMLElement, name: string, key: "command" | "everything"): void {
		new Setting(containerEl).setName(name).addText((text) =>
			text.setValue(this.plugin.settings.prefixes[key]).onChange(async (value) => {
				this.plugin.settings.prefixes[key] = value.replace(/[\r\n]/g, "");
				await this.plugin.saveSettings();
			}),
		);
	}

	private addKeybinding(containerEl: HTMLElement, action: ActionId): void {
		const keybindings = this.plugin.settings.keybindings[action] ?? [];
		new Setting(containerEl)
			.setName(action)
			.setDesc("Comma-separated shortcuts")
			.addText((text) =>
				text.setValue(keybindings.join(", ")).onChange(async (value) => {
					this.plugin.settings.keybindings[action] = value
						.split(",")
						.map((v) => v.trim())
						.filter(Boolean);
					await this.plugin.saveSettings();
				}),
			);
	}
}
