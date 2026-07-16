export const ACTION_IDS = [
	"next",
	"previous",
	"primary",
	"alternate",
	"tertiary",
	"close",
] as const;
export type ActionId = (typeof ACTION_IDS)[number];

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
	keybindings: Record<ActionId, string[]>;
	recentCommandIds: string[];
}

export const DEFAULT_KEYBINDINGS: Record<ActionId, string[]> = {
	next: ["ArrowDown"],
	previous: ["ArrowUp"],
	primary: ["Enter"],
	alternate: ["Ctrl+Enter"],
	tertiary: ["Ctrl+Shift+Enter"],
	close: ["Escape"],
};

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
