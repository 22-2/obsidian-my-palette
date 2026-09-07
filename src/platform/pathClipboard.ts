import { Menu, Notice } from "obsidian";

export interface CopyablePaths {
	fileName?: string;
	relativePath?: string;
	absolutePath?: string;
}

/** Keeps path-copy menu labels and clipboard error handling identical across file lists. */
export function addCopyPathMenuItems(
	menu: Menu,
	paths: CopyablePaths,
	onCopy: (path: string) => void,
): void {
	if (!paths.fileName && !paths.relativePath && !paths.absolutePath) return;
	menu.addSeparator();
	if (paths.fileName) {
		menu.addItem((item) =>
			item
				.setTitle("Copy file name")
				.setIcon("copy")
				.onClick(() => onCopy(paths.fileName!)),
		);
	}
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

/** Adds newline-delimited copy actions for the current visible selection. */
export function addCopyPathListMenuItems(
	menu: Menu,
	pathsList: readonly CopyablePaths[],
	onCopy: (values: string[]) => void,
): void {
	const fileNames = uniqueValues(pathsList.map(({ fileName }) => fileName));
	const relativePaths = uniqueValues(pathsList.map(({ relativePath }) => relativePath));
	const absolutePaths = uniqueValues(pathsList.map(({ absolutePath }) => absolutePath));
	if (!fileNames.length && !relativePaths.length && !absolutePaths.length) return;
	menu.addSeparator();
	addListItem(menu, "Copy file names", "copy", fileNames, onCopy);
	addListItem(menu, "Copy paths relative to Vault", "copy", relativePaths, onCopy);
	addListItem(menu, "Copy absolute paths", "clipboard-copy", absolutePaths, onCopy);
}

export async function copyPathListToClipboard(values: readonly string[]): Promise<void> {
	try {
		await navigator.clipboard.writeText(values.join("\n"));
		new Notice(`${values.length} items copied.`);
	} catch {
		new Notice("Could not copy the selected items.");
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

function addListItem(
	menu: Menu,
	title: string,
	icon: string,
	values: string[],
	onCopy: (values: string[]) => void,
): void {
	if (!values.length) return;
	menu.addItem((item) =>
		item
			.setTitle(`${title} (${values.length})`)
			.setIcon(icon)
			.onClick(() => onCopy(values)),
	);
}

function uniqueValues(values: readonly (string | undefined)[]): string[] {
	return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
