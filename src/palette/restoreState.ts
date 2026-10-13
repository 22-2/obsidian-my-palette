import type { ReturnToHomeSeconds } from "src/settings/model";

/** What a closed palette leaves behind for the next Open palette. Kept in memory only. */
export interface PaletteRestoreState {
	/** The input with its mode alias, so restoring it enters the same mode. */
	input: string;
	includeIgnored: boolean;
	activeIndex: number;
	scrollTop: number;
}

/**
 * Whether a palette closed at `closedAt` may be restored at `now`. A palette closed
 * exactly the allowed number of seconds ago is still restored; 0 never restores.
 */
export function shouldRestore(
	closedAt: number,
	now: number,
	seconds: ReturnToHomeSeconds,
): boolean {
	return seconds > 0 && now - closedAt <= seconds * 1000;
}
