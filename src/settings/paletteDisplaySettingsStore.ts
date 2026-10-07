import type { MyPaletteSettings, PaletteDisplaySettings, PaletteSurface } from "src/settings/model";

type DisplayListener = (settings: PaletteDisplaySettings) => void;

/** Plugin-owned display state keeps UI instances out of global registries. */
export class PaletteDisplaySettingsStore {
	private readonly listeners = new Map<PaletteSurface, Set<DisplayListener>>();

	constructor(
		private readonly getSettings: () => MyPaletteSettings,
		private readonly save: () => Promise<void>,
	) {}

	get(surface: PaletteSurface): PaletteDisplaySettings {
		return this.getSettings().paletteDisplay[surface];
	}

	subscribe(surface: PaletteSurface, listener: DisplayListener): () => void {
		let listeners = this.listeners.get(surface);
		if (!listeners) {
			listeners = new Set();
			this.listeners.set(surface, listeners);
		}
		listeners.add(listener);
		listener(this.get(surface));
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) this.listeners.delete(surface);
		};
	}

	async toggleHighlight(surface: PaletteSurface): Promise<void> {
		const settings = this.getSettings();
		const next = {
			...this.get(surface),
			highlightSearchMatches: !this.get(surface).highlightSearchMatches,
		};
		// Why: replace only this surface's branch so defaults and other surface preferences remain independent.
		settings.paletteDisplay = { ...settings.paletteDisplay, [surface]: next };
		// Why: notify before saving to keep open surfaces responsive without rerunning searches or resetting selection.
		for (const listener of this.listeners.get(surface) ?? []) listener(next);
		await this.save();
	}

	dispose(): void {
		this.listeners.clear();
	}
}
