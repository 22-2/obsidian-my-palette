import { join, posix } from "node:path";
import type { App, TFile } from "obsidian";
import type { GitFileResult } from "src/core/results";
import { vaultPathFromAbsolute } from "src/features/ignored-notes/ignoredPaths";
import { contentReference, readVersionBytes } from "src/features/git/gitClient";

/** 履歴の内容を、元のファイルを上書きしない編集可能なコピーとして作る。 */
export async function restoreGitFile(app: App, result: GitFileResult): Promise<TFile> {
	const ref = contentReference(result.commit, result.change);
	const data = await readVersionBytes(result.root, ref.hash, ref.path);
	const local = vaultPathFromAbsolute(app, join(result.root, result.change.path));
	const parent = local ? posix.dirname(local) : ".";
	// 元の場所が Vault 外か削除済みなら、復元先を見失わないよう Vault のルートへ置く。
	const folder = parent !== "." && app.vault.getFolderByPath(parent) ? `${parent}/` : "";
	const name = posix.basename(ref.path);
	const extension = posix.extname(name);
	const base = name.slice(0, name.length - extension.length);
	const prefix = `${folder}${base} (復元 ${ref.hash.slice(0, 8)})`;
	let path = `${prefix}${extension}`;
	for (let index = 2; await app.vault.adapter.exists(path); index++)
		path = `${prefix} ${index}${extension}`;
	return app.vault.createBinary(path, Uint8Array.from(data).buffer);
}
