import type { ReturnToHomeSeconds } from "src/settings/model";

/** 閉じられたパレットが、次の「ホームを開く」のために残す状態。メモリ上にだけ保持する。 */
export interface PaletteRestoreState {
	/** エイリアス付きの入力。復元するとそのモードに入り直す。 */
	input: string;
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
