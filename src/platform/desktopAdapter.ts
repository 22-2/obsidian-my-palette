import type { App } from "obsidian";

export interface DesktopAdapter {
	fs: {
		promises: {
			readFile(path: string, encoding: "utf8"): Promise<string>;
			stat(path: string): Promise<unknown>;
		};
	};
	path: {
		basename(path: string): string;
		relative(from: string, to: string): string;
		// Node's path adapter accepts a Vault root and a relative path together.
		// Keep the type variadic so callers can use its actual resolution behavior.
		resolve(...paths: string[]): string;
		sep: string;
		isAbsolute(path: string): boolean;
	};
}

export function getDesktopAdapter(app: App): DesktopAdapter {
	return app.vault.adapter as unknown as DesktopAdapter;
}
