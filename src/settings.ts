import { PluginSettingTab, Setting, Notice } from "obsidian";
import type MyPalettePlugin from "./main";

export interface MyPaletteSettings {
	schemaVersion: 1;
	showLog: boolean;
	prefixes: { command: string; everything: string };
	everything: {
		esPath: string;
		instanceName: string;
		maxResults: number;
		debounceMs: number;
		esTimeoutMs: number;
		processTimeoutMs: number;
	};
	recentCommandIds: string[];
}

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
	recentCommandIds: [],
};

function bounded(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, Math.round(value)))
		: fallback;
}

export function mergeSettings(data: unknown): MyPaletteSettings {
	const source = (data && typeof data === "object" ? data : {}) as Partial<MyPaletteSettings>;
	const prefixes = source.prefixes ?? {};
	const everything = source.everything ?? {};
	return {
		...DEFAULT_SETTINGS,
		showLog: typeof source.showLog === "boolean" ? source.showLog : false,
		prefixes: {
			command: typeof prefixes.command === "string" ? prefixes.command : ">",
			everything: typeof prefixes.everything === "string" ? prefixes.everything : "e ",
		},
		everything: {
			esPath: typeof everything.esPath === "string" ? everything.esPath : "",
			instanceName:
				typeof everything.instanceName === "string" && everything.instanceName.trim()
					? everything.instanceName.trim()
					: "1.5a",
			maxResults: bounded(everything.maxResults, 100, 10, 500),
			debounceMs: bounded(everything.debounceMs, 150, 50, 1000),
			esTimeoutMs: bounded(everything.esTimeoutMs, 3000, 500, 10000),
			processTimeoutMs: bounded(everything.processTimeoutMs, 5000, 500, 15000),
		},
		recentCommandIds: Array.isArray(source.recentCommandIds)
			? source.recentCommandIds
					.filter((id): id is string => typeof id === "string")
					.slice(0, 20)
			: [],
	};
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
				this.plugin.settings.prefixes[key] = value.replace(/[\r\n\0]/g, "");
				await this.plugin.saveSettings();
			}),
		);
	}
}
