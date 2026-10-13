import { Notice, Setting, setIcon, type App } from "obsidian";
import type { SettingsHost } from "src/settings/settingsHost";
import { DEFAULT_SETTINGS, SETTING_LIMITS } from "src/settings/model";

/** The names inside the Everything modal, so the Integrations row is found by any of them. */
export const EVERYTHING_MODAL_ITEMS = [
	"HTTP server URL",
	"Username",
	"Password",
	"Test connection",
	"Maximum results",
	"Input delay",
	"Request timeout",
] as const;

/** Whether Smart Connections is installed, under either of its plugin ids. */
export function isSmartConnectionsInstalled(app: App): boolean {
	const plugins = (app as unknown as { plugins: { plugins: Record<string, unknown> } }).plugins
		.plugins;
	return Boolean(plugins["smart-connections"] ?? plugins["smart-connect-pro"]);
}

function addSwitch(
	setting: Setting,
	value: boolean,
	onChange: (value: boolean) => Promise<void>,
): void {
	setting.addToggle((toggle) => toggle.setValue(value).onChange(onChange));
}

/**
 * The Everything row: its name and a chevron open a panel below it with the connection
 * and result settings, and the switch stays at the right end of the header.
 */
export function renderEverythingIntegration(setting: Setting, plugin: SettingsHost): void {
	const panelId = "my-palette-everything-panel";
	setting.settingEl.addClass("my-palette-accordion");
	setting.nameEl.empty();
	const header = setting.nameEl.createEl("button", {
		cls: "my-palette-accordion__header",
		attr: { type: "button", "aria-expanded": "false", "aria-controls": panelId },
	});
	header.createSpan({ text: "Everything" });
	setIcon(header.createSpan("my-palette-accordion__chevron"), "chevron-right");
	const panel = setting.settingEl.createDiv({
		cls: "my-palette-accordion__panel",
		attr: { id: panelId },
	});
	panel.hidden = true;
	renderEverythingFields(panel, plugin);
	header.addEventListener("click", () => {
		const expanded = header.getAttribute("aria-expanded") === "true";
		header.setAttribute("aria-expanded", String(!expanded));
		panel.hidden = expanded;
	});
	addSwitch(setting, plugin.settings.integrations.everything.enabled, async (value) => {
		plugin.settings.integrations.everything.enabled = value;
		await plugin.saveSettings();
	});
}

export function renderSmartConnectionsIntegration(
	setting: Setting,
	plugin: SettingsHost,
	installed: boolean,
): void {
	if (!installed)
		setting.infoEl.createDiv({ cls: "my-palette-mode-note", text: "Not installed" });
	addSwitch(setting, plugin.settings.integrations.smartConnections.enabled, async (value) => {
		plugin.settings.integrations.smartConnections.enabled = value;
		await plugin.saveSettings();
	});
}

/** Switched on means Markdown opens in VS Code, which is the opposite of the stored setting. */
export function renderVscodeIntegration(setting: Setting, plugin: SettingsHost): void {
	addSwitch(setting, !plugin.settings.openExternalMarkdownInObsidian, async (value) => {
		plugin.settings.openExternalMarkdownInObsidian = !value;
		await plugin.saveSettings();
	});
}

/**
 * Everything's connection and result settings. Each change is saved as it is made,
 * like the rest of the settings.
 */
function renderEverythingFields(containerEl: HTMLElement, plugin: SettingsHost): void {
	const { everything } = plugin.settings;

	new Setting(containerEl).setName("Connection").setHeading();
	const url = new Setting(containerEl)
		.setName("HTTP server URL")
		.setDesc("URL configured in the official Everything 1.5 HTTP Server plugin.");
	const urlError = url.infoEl.createDiv({
		cls: "my-palette-mode-error",
		attr: { role: "alert" },
	});
	urlError.hidden = true;
	url.addText((text) => {
		text.setPlaceholder(DEFAULT_SETTINGS.everything.httpUrl)
			.setValue(everything.httpUrl)
			.onChange(async (value) => {
				try {
					new URL(value);
				} catch {
					urlError.textContent = "Enter a valid URL.";
					urlError.hidden = false;
					return;
				}
				urlError.hidden = true;
				everything.httpUrl = value.trim();
				await plugin.saveSettings();
			});
	});

	new Setting(containerEl)
		.setName("Username")
		.setDesc("Optional username configured in Everything.")
		.addText((text) =>
			text.setValue(everything.username).onChange(async (value) => {
				everything.username = value;
				await plugin.saveSettings();
			}),
		);
	new Setting(containerEl)
		.setName("Password")
		.setDesc("Stored in this plugin's local data.json.")
		.addText((text) => {
			text.inputEl.type = "password";
			text.setValue(everything.password).onChange(async (value) => {
				everything.password = value;
				await plugin.saveSettings();
			});
		});
	new Setting(containerEl)
		.setName("Test connection")
		.setDesc("Runs a harmless query against the configured HTTP server.")
		.addButton((button) =>
			button.setButtonText("Test").onClick(async () => {
				const result = await plugin.testEverythingConnection();
				new Notice(result.ok ? result.message : `Everything: ${result.message}`);
			}),
		);

	new Setting(containerEl).setName("Results and timing").setHeading();
	addSlider(
		containerEl,
		plugin,
		"Maximum results",
		"Most results requested from Everything for each search.",
		everything.maxResults,
		SETTING_LIMITS.everything.maxResults,
		(value) => (everything.maxResults = value),
	);
	addSlider(
		containerEl,
		plugin,
		"Input delay",
		"Milliseconds to wait after typing before asking Everything.",
		everything.debounceMs,
		SETTING_LIMITS.everything.debounceMs,
		(value) => (everything.debounceMs = value),
	);
	addSlider(
		containerEl,
		plugin,
		"Request timeout",
		"Milliseconds to wait for Everything before showing an error.",
		everything.requestTimeoutMs,
		SETTING_LIMITS.everything.requestTimeoutMs,
		(value) => (everything.requestTimeoutMs = value),
	);
}

function addSlider(
	containerEl: HTMLElement,
	plugin: SettingsHost,
	name: string,
	desc: string,
	value: number,
	limits: { min: number; max: number; step: number },
	store: (value: number) => void,
): void {
	new Setting(containerEl)
		.setName(name)
		.setDesc(desc)
		.addSlider((slider) =>
			slider
				.setLimits(limits.min, limits.max, limits.step)
				.setValue(value)
				.onChange(async (next) => {
					store(next);
					await plugin.saveSettings();
				}),
		);
}
