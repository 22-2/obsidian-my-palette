import { Notice, Setting, setIcon, type App } from "obsidian";
import type { SettingsHost } from "src/settings/settingsHost";
import { DEFAULT_SETTINGS, SETTING_LIMITS } from "src/settings/model";
import { ICONS } from "src/ui/icons";
import { getCommunityPlugin } from "src/platform/obsidianInternals";
import { t } from "src/i18n";

/** Everything のモーダルの中の名前。連携の行は、このどれからでも見つけられる。 */
export const EVERYTHING_MODAL_ITEMS = [
	t("settings.everything.item.url"),
	t("settings.everything.item.username"),
	t("settings.everything.item.password"),
	t("settings.everything.item.test"),
	t("settings.everything.item.maxResults"),
	t("settings.everything.item.inputDelay"),
	t("settings.everything.item.timeout"),
] as const;

/** Smart Connections がインストールされているかどうか。どちらのプラグイン ID でも。 */
export function isSmartConnectionsInstalled(app: App): boolean {
	return (
		getCommunityPlugin(app, "smart-connections") !== undefined ||
		getCommunityPlugin(app, "smart-connect-pro") !== undefined
	);
}

function addSwitch(
	setting: Setting,
	value: boolean,
	onChange: (value: boolean) => Promise<void>,
): void {
	setting.addToggle((toggle) => toggle.setValue(value).onChange(onChange));
}

/**
 * Everything のカードは、スイッチ以外のヘッダーのどこを押しても設定を開く。
 */
export function renderEverythingIntegration(setting: Setting, plugin: SettingsHost): void {
	const panelId = "my-palette-everything-panel";
	setting.settingEl.addClass("my-palette-accordion");
	const header = setting.settingEl.createDiv("my-palette-accordion__header");
	header.append(setting.infoEl, setting.controlEl);
	setting.nameEl.id = "my-palette-everything-name";
	setting.infoEl.setAttrs({
		role: "button",
		tabindex: "0",
		"aria-labelledby": setting.nameEl.id,
		"aria-expanded": "false",
		"aria-controls": panelId,
	});
	setIcon(setting.nameEl.createSpan("my-palette-accordion__chevron"), ICONS.expand);
	const panel = setting.settingEl.createDiv({
		cls: "my-palette-accordion__panel",
		attr: { id: panelId },
	});
	panel.hidden = true;
	renderEverythingFields(panel, plugin);
	const togglePanel = () => {
		const expanded = setting.infoEl.getAttribute("aria-expanded") === "true";
		setting.infoEl.setAttribute("aria-expanded", String(!expanded));
		panel.hidden = expanded;
	};
	header.addEventListener("click", (event) => {
		if (event.composedPath().includes(setting.controlEl)) return;
		togglePanel();
	});
	setting.infoEl.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		togglePanel();
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
		setting.infoEl.createDiv({
			cls: "my-palette-mode-note",
			text: t("settings.smart.notInstalled"),
		});
	addSwitch(setting, plugin.settings.integrations.smartConnections.enabled, async (value) => {
		plugin.settings.integrations.smartConnections.enabled = value;
		await plugin.saveSettings();
	});
}

/** オンは、Markdown を VS Code で開くこと。保存された設定とは逆になる。 */
export function renderVscodeIntegration(setting: Setting, plugin: SettingsHost): void {
	addSwitch(setting, !plugin.settings.openExternalMarkdownInObsidian, async (value) => {
		plugin.settings.openExternalMarkdownInObsidian = !value;
		await plugin.saveSettings();
	});
}

/**
 * Everything の接続と結果の設定。設定のほかの項目と同じく、変更のたびにすぐ保存する。
 */
function renderEverythingFields(containerEl: HTMLElement, plugin: SettingsHost): void {
	const { everything } = plugin.settings;

	new Setting(containerEl).setName(t("settings.everything.connection")).setHeading();
	const url = new Setting(containerEl)
		.setName(t("settings.everything.item.url"))
		.setDesc(t("settings.everything.urlDesc"));
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
					urlError.textContent = t("settings.everything.urlInvalid");
					urlError.hidden = false;
					return;
				}
				urlError.hidden = true;
				everything.httpUrl = value.trim();
				await plugin.saveSettings();
			});
	});

	new Setting(containerEl)
		.setName(t("settings.everything.item.username"))
		.setDesc(t("settings.everything.usernameDesc"))
		.addText((text) =>
			text.setValue(everything.username).onChange(async (value) => {
				everything.username = value;
				await plugin.saveSettings();
			}),
		);
	new Setting(containerEl)
		.setName(t("settings.everything.item.password"))
		.setDesc(t("settings.everything.passwordDesc"))
		.addText((text) => {
			text.inputEl.type = "password";
			text.setValue(everything.password).onChange(async (value) => {
				everything.password = value;
				await plugin.saveSettings();
			});
		});
	new Setting(containerEl)
		.setName(t("settings.everything.item.test"))
		.setDesc(t("settings.everything.testDesc"))
		.addButton((button) =>
			button.setButtonText(t("settings.everything.testButton")).onClick(async () => {
				const result = await plugin.testEverythingConnection();
				new Notice(
					result.ok
						? result.message
						: t("settings.everything.prefixed", { message: result.message }),
				);
			}),
		);

	new Setting(containerEl).setName(t("settings.everything.resultsTiming")).setHeading();
	addSlider(
		containerEl,
		plugin,
		t("settings.everything.item.maxResults"),
		t("settings.everything.maxResultsDesc"),
		everything.maxResults,
		SETTING_LIMITS.everything.maxResults,
		(value) => (everything.maxResults = value),
	);
	addSlider(
		containerEl,
		plugin,
		t("settings.everything.item.inputDelay"),
		t("settings.everything.inputDelayDesc"),
		everything.debounceMs,
		SETTING_LIMITS.everything.debounceMs,
		(value) => (everything.debounceMs = value),
	);
	addSlider(
		containerEl,
		plugin,
		t("settings.everything.item.timeout"),
		t("settings.everything.timeoutDesc"),
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
