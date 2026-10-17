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
		// Node のパスのアダプターは、Vault のルートと相対パスを一緒に受け付ける。
		// 呼び出し元が実際の解決の挙動を使えるように、型は可変長のままにする。
		resolve(...paths: string[]): string;
		sep: string;
		isAbsolute(path: string): boolean;
	};
}

export function getDesktopAdapter(app: App): DesktopAdapter {
	return app.vault.adapter as unknown as DesktopAdapter;
}
