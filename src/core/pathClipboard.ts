import { Menu, Notice } from "obsidian";

export interface CopyablePaths {
	relativePath?: string;
	absolutePath?: string;
}

/** Keeps path-copy menu labels and clipboard error handling identical across file lists. */
export function addCopyPathMenuItems(
	menu: Menu,
	paths: CopyablePaths,
	onCopy: (path: string) => void,
): void {
	if (!paths.relativePath && !paths.absolutePath) return;
	menu.addSeparator();
	if (paths.relativePath) {
		menu.addItem((item) =>
			item
				.setTitle("Copy path relative to Vault")
				.setIcon("copy")
				.onClick(() => onCopy(paths.relativePath!)),
		);
	}
	if (paths.absolutePath) {
		menu.addItem((item) =>
			item
				.setTitle("Copy absolute path")
				.setIcon("clipboard-copy")
				.onClick(() => onCopy(paths.absolutePath!)),
		);
	}
}

export async function copyPathToClipboard(value: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(value);
		new Notice("Path copied.");
	} catch {
		new Notice("Could not copy the path.");
	}
}
