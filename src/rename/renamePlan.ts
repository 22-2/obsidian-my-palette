export interface RenameOptions {
	/** Reads the find part as a regular expression and the replacement as `$1`-style. */
	regex: boolean;
	matchCase: boolean;
	/** Replaces every match in a name, not just the first. */
	all: boolean;
}

export type RenameRule =
	/** The input does not describe a rename yet, e.g. the `/` has not been typed. */
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

// Why: these are the characters Obsidian refuses in file names.
const ILLEGAL_NAME_CHARACTERS = /[\\/:*?"<>|]/;

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parses `find/replace`. A file name cannot contain `/`, so the first one safely splits
 * the input without any escaping; a regular expression therefore cannot contain `/`.
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
	// Why: a function replacer keeps `$&` and friends literal outside regex mode.
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
 * Applies the rule to each file name without its extension, then flags names that Obsidian
 * would reject or that collide with another file. `existingPaths` holds every vault path,
 * lower-cased, because most file systems treat names case-insensitively.
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

/** Whether applying the plan would fail or overwrite something. */
export function isBlocked(rows: readonly RenamePlanRow[]): boolean {
	return rows.some(
		(row) => row.status === "invalid" || row.status === "exists" || row.status === "duplicate",
	);
}

export function renamableRows(rows: readonly RenamePlanRow[]): RenamePlanRow[] {
	return rows.filter((row) => row.status === "ready");
}
