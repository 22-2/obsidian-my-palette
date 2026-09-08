import type { App } from "obsidian";

type IgnoredNoteScanLogger = (message: string, detail?: unknown) => void;

export async function collectVaultPaths(
	app: App,
	roots: readonly string[],
	log: IgnoredNoteScanLogger,
): Promise<string[]> {
	const adapter = app.vault.adapter;
	const folders = [...new Set(roots)];
	const visited = new Set<string>();
	const files: string[] = [];
	while (folders.length > 0) {
		const folder = folders.shift();
		if (folder === undefined || visited.has(folder)) continue;
		visited.add(folder);
		try {
			const stat = await adapter.stat(folder);
			// Ignore filters can outlive a moved or deleted folder. Do not call
			// list() for a missing root, because that turns stale settings into errors.
			if (!stat) {
				log("Skipped missing ignored folder", { folder });
				continue;
			}
			if (stat.type === "file") {
				files.push(folder);
				continue;
			}
			const listing = await adapter.list(folder);
			files.push(...listing.files);
			folders.push(...listing.folders);
		} catch (error) {
			if (isMissingPathError(error)) {
				log("Skipped missing ignored folder", { folder });
				continue;
			}
			log("Failed to list ignored folder", { folder, error });
		}
	}
	return files;
}

export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	callback: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results: R[] = Array.from({ length: items.length });
	let nextIndex = 0;
	const worker = async (): Promise<void> => {
		while (true) {
			const index = nextIndex++;
			if (index >= items.length) return;
			results[index] = await callback(items[index], index);
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
	return results;
}

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}
