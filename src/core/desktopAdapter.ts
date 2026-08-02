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
		resolve(path: string): string;
		sep: string;
		isAbsolute(path: string): boolean;
	};
}

export function getDesktopAdapter(app: App): DesktopAdapter {
	return app.vault.adapter as unknown as DesktopAdapter;
}
