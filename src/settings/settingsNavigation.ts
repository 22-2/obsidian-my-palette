import type { SettingsEntryResult } from "src/palette/results";

export type SettingsPageName = "General" | "Modes" | "File search" | "Shortcuts" | "Integrations";

/** Home labels and their existing declarative settings pages, in navigation order. */
const HOME_SETTINGS: readonly { name: string; pageName: SettingsPageName }[] = [
	{ name: "General", pageName: "General" },
	{ name: "Modes", pageName: "Modes" },
	{ name: "File search", pageName: "File search" },
	{ name: "Shortcuts", pageName: "Shortcuts" },
	{ name: "Integration", pageName: "Integrations" },
];

export function settingsEntries(input: string): SettingsEntryResult[] {
	const terms = input.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	return HOME_SETTINGS.filter(({ name }) => {
		const words = `${name} Settings`.toLocaleLowerCase().split(/\s+/);
		return terms.every((term) => words.some((word) => word.startsWith(term)));
	}).map(({ name, pageName }) => ({
		id: `settings:${pageName}`,
		mode: "settings-entry",
		primary: name,
		secondary: "",
		icon: "settings",
		pageName,
	}));
}
