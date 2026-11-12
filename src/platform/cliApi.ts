import type { CliData, CliFlags } from "obsidian";
import type MyPalettePlugin from "src/main";

/**
 * Obsidian CLI の API。`obsidian my-palette:<action> ...` として登録される。
 * `run` が返した値は JSON として出力する。
 */
export interface CliApi {
	action: string;
	description: string;
	flags: CliFlags;
	run: (plugin: MyPalettePlugin, params: CliData) => Promise<unknown>;
}
