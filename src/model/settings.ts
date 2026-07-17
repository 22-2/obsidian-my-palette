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
	schemaVersion: 2;
	showLog: boolean;
	prefixes: { command: string; everything: string };
	everything: {
		httpUrl: string;
		username: string;
		password: string;
		maxResults: number;
		debounceMs: number;
		requestTimeoutMs: number;
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
	schemaVersion: 2,
	showLog: false,
	prefixes: { command: ">", everything: "e " },
	everything: {
		httpUrl: "http://127.0.0.1:8080/",
		username: "",
		password: "",
		maxResults: 100,
		debounceMs: 150,
		requestTimeoutMs: 30000,
	},
	keybindings: structuredClone(DEFAULT_KEYBINDINGS),
	recentCommandIds: [],
};
