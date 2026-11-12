import type { PaletteRoute } from "src/features/palette/PaletteSearchSession";
import type { ReturnToHomeSeconds } from "src/core/settingsModel";

/** 閉じられたパレットが、次の「ホームを開く」のために残す状態。メモリ上にだけ保持する。 */
export interface PaletteRestoreState {
	/** モードの検索語、または Home の入力。 */
	input: string;
	route: PaletteRoute;
	includeIgnored: boolean;
	activeIndex: number;
	scrollTop: number;
}

/**
 * `closedAt` に閉じられたパレットを、`now` に復元してよいかどうか。許される秒数の
 * ちょうど前に閉じられたパレットは、まだ復元する。0 なら決して復元しない。
 */
export function shouldRestore(
	closedAt: number,
	now: number,
	seconds: ReturnToHomeSeconds,
): boolean {
	return seconds > 0 && now - closedAt <= seconds * 1000;
}
