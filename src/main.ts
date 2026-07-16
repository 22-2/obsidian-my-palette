import { Plugin } from "obsidian";
import log, { LogLevels } from "consola";
import {
	type MyPluginSettings,
	MyPluginSettingTab,
	DEFAULT_SETTINGS,
} from "./settings";

const logger = log.withTag("MyPlugin");

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new MyPluginSettingTab(this));
		this.initializeLogger();
	}

	onunload() {
		logger.debug("Plugin unloaded");
	}

	initializeLogger(): void {
		logger.level = this.settings.showLog ? LogLevels.debug : LogLevels.error;
		logger.debug("debug mode enabled");
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<MyPluginSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
