export interface RenameOptions {
	/** 検索の部分を正規表現として、置換の部分を `$1` の形式として読む。 */
	regex: boolean;
	matchCase: boolean;
	/** 名前の中の一致を、最初の1つだけでなくすべて置き換える。 */
	all: boolean;
}

export type RenameRule =
	/** 入力がまだ名前の変更を表していない。例: `/` がまだ入力されていない。 */
	| { kind: "none" }
	| { kind: "error"; message: string }
	| { kind: "rule"; apply: (name: string) => string };

export type RenameStatus = "unchanged" | "ready" | "invalid" | "exists" | "duplicate";

export interface RenamePlanRow {
	path: string;
	oldName: string;
	newName: string;
	newPath: string;
	status: RenameStatus;
}

// Why: これらは Obsidian がファイル名として拒否する文字。
const ILLEGAL_NAME_CHARACTERS = /[\\/:*?"<>|]/;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `検索/置換` を解析する。ファイル名には `/` を含められないので、最初の `/` は、エスケープなしで
 * 入力を安全に分けられる。そのため、正規表現にも `/` は含まれない。
 */
export function parseRenameRule(input: string, options: RenameOptions): RenameRule {
	const slash = input.indexOf("/");
	if (slash < 0) return { kind: "none" };
	const find = input.slice(0, slash);
	const replacement = input.slice(slash + 1);
	if (!find) return { kind: "none" };
	const flags = (options.all ? "g" : "") + (options.matchCase ? "" : "i");
	let pattern: RegExp;
	try {
		pattern = new RegExp(options.regex ? find : escapeRegExp(find), flags);
	} catch (error) {
		return { kind: "error", message: error instanceof Error ? error.message : String(error) };
	}
	// Why: 関数の置換は、正規表現モード以外で `$&` などをリテラルのまま残す。
	if (options.regex) return { kind: "rule", apply: (name) => name.replace(pattern, replacement) };
	return { kind: "rule", apply: (name) => name.replace(pattern, () => replacement) };
}

function splitPath(path: string): { directory: string; stem: string; extension: string } {
	const slash = path.lastIndexOf("/");
	const directory = slash < 0 ? "" : path.slice(0, slash + 1);
	const name = path.slice(slash + 1);
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return { directory, stem: name, extension: "" };
	return { directory, stem: name.slice(0, dot), extension: name.slice(dot) };
}

function isValidStem(stem: string): boolean {
	return stem !== "" && !ILLEGAL_NAME_CHARACTERS.test(stem) && !/[. ]$/.test(stem);
}

/**
 * 拡張子を除いた各ファイル名にルールを適用し、その後、Obsidian が拒否する名前や、ほかのファイルと
 * 衝突する名前に印を付ける。`existingPaths` は小文字にした Vault のパスをすべて持つ。多くのファイルシステムは
 * 名前の大文字・小文字を区別しないため。
 */
export function planRename(
	paths: readonly string[],
	rule: RenameRule,
	existingPaths: ReadonlySet<string>,
): RenamePlanRow[] {
	const rows = paths.map((path): RenamePlanRow => {
		const { directory, stem, extension } = splitPath(path);
		const oldName = stem + extension;
		if (rule.kind !== "rule")
			return { path, oldName, newName: oldName, newPath: path, status: "unchanged" };
		const newStem = rule.apply(stem);
		const newName = newStem + extension;
		const newPath = directory + newName;
		if (newPath === path) return { path, oldName, newName, newPath, status: "unchanged" };
		if (!isValidStem(newStem)) return { path, oldName, newName, newPath, status: "invalid" };
		const taken =
			existingPaths.has(newPath.toLowerCase()) &&
			newPath.toLowerCase() !== path.toLowerCase();
		return { path, oldName, newName, newPath, status: taken ? "exists" : "ready" };
	});
	const counts = new Map<string, number>();
	for (const row of rows)
		if (row.status === "ready") {
			const key = row.newPath.toLowerCase();
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	return rows.map((row) =>
		row.status === "ready" && (counts.get(row.newPath.toLowerCase()) ?? 0) > 1
			? { ...row, status: "duplicate" }
			: row,
	);
}

/** 計画を適用すると、失敗するか何かを上書きするかどうか。 */
export function isBlocked(rows: readonly RenamePlanRow[]): boolean {
	return rows.some(
		(row) => row.status === "invalid" || row.status === "exists" || row.status === "duplicate",
	);
}

export function renamableRows(rows: readonly RenamePlanRow[]): RenamePlanRow[] {
	return rows.filter((row) => row.status === "ready");
}
