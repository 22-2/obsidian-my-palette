import type { MyPaletteSettings, PaletteDisplaySettings, PaletteSurface } from "src/settings/model";

type DisplayListener = (settings: PaletteDisplaySettings) => void;

/** プラグインが持つ表示の状態。UI のインスタンスを、グローバルな登録簿の外に置く。 */
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
		await this.setHighlight(surface, !this.get(surface).highlightSearchMatches);
	}

	async setHighlight(surface: PaletteSurface, highlightSearchMatches: boolean): Promise<void> {
		const settings = this.getSettings();
		const next = { ...this.get(surface), highlightSearchMatches };
		// Why: この画面の枝だけを置き換え、既定値とほかの画面の設定は独立に保つ。
		settings.paletteDisplay = { ...settings.paletteDisplay, [surface]: next };
		// Why: 保存の前に通知し、検索をやり直したり選択をリセットしたりせずに、開いている画面を応答させる。
		for (const listener of this.listeners.get(surface) ?? []) listener(next);
		await this.save();
	}

	dispose(): void {
		this.listeners.clear();
	}
}
