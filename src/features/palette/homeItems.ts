import type { App } from "obsidian";
import type { PaletteResult } from "src/core/results";
import { DATABASE_NAMES } from "src/platform/databaseNames";
import { RecentIdStore } from "src/platform/recentIdStore";

export function homeItemId(result: PaletteResult): string | undefined {
	if (result.mode === "file") return `file:${result.vaultPath}`;
	if (result.mode === "mode-entry" && result.modeId !== "other") return `mode:${result.modeId}`;
	return undefined;
}

/** Home のモードとファイルが共有する履歴と、手動で並べるピン。 */
export class HomeItems {
	private readonly recent: RecentIdStore;
	private readonly pins: RecentIdStore;

	constructor(app: App) {
		const create = (databaseName: string, label: string) =>
			new RecentIdStore(app, {
				databaseName,
				idField: "id",
				migrationName: label,
				maxEntries: 10000,
				label,
			});
		this.recent = create(DATABASE_NAMES.homeRecent, "home recent items");
		this.pins = create(DATABASE_NAMES.homePins, "home pinned items");
	}

	async load(recentFiles: readonly string[]): Promise<void> {
		await Promise.all([
			this.recent.load(recentFiles.map((path) => `file:${path}`)),
			this.pins.load(),
		]);
	}

	record(id: string): void {
		this.recent.record(id);
	}

	get pinned(): readonly string[] {
		return this.pins.getIds();
	}

	get recents(): readonly string[] {
		return this.recent.getIds();
	}

	togglePin(id: string): void {
		const pins = this.pinned;
		this.pins.setIds(pins.includes(id) ? pins.filter((item) => item !== id) : [...pins, id]);
	}

	movePin(id: string, direction: -1 | 1): void {
		const pins = [...this.pinned];
		const index = pins.indexOf(id);
		const target = index + direction;
		if (index < 0 || target < 0 || target >= pins.length) return;
		[pins[index], pins[target]] = [pins[target], pins[index]];
		this.pins.setIds(pins);
	}

	renameFile(oldPath: string, newPath: string): void {
		const oldId = `file:${oldPath}`;
		const newId = `file:${newPath}`;
		for (const store of [this.recent, this.pins])
			store.setIds(
				store.getIds().map((id) => {
					if (id === oldId) return newId;
					return id.startsWith(`${oldId}/`) ? `${newId}${id.slice(oldId.length)}` : id;
				}),
			);
	}

	async dispose(): Promise<void> {
		await Promise.all([this.recent.dispose(), this.pins.dispose()]);
	}
}

export function sortHomeItems(
	items: readonly PaletteResult[],
	pins: readonly string[],
	recents: readonly string[],
): PaletteResult[] {
	const pinRanks = new Map(pins.map((id, index) => [id, index]));
	const recentRanks = new Map(recents.map((id, index) => [id, index]));
	return [...items].sort((a, b) => {
		const aId = homeItemId(a) ?? "";
		const bId = homeItemId(b) ?? "";
		return (
			(pinRanks.get(aId) ?? Infinity) - (pinRanks.get(bId) ?? Infinity) ||
			(recentRanks.get(aId) ?? Infinity) - (recentRanks.get(bId) ?? Infinity)
		);
	});
}
