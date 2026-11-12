import type { App, TFile } from "obsidian";
import { readList } from "src/features/properties/propertyList";
import { setOrDeleteFrontmatterList, writeFrontmatter } from "src/core/frontmatter";
import type { MultiSelectChanges } from "src/ui/multiSelectChanges";
import { t } from "src/i18n";

export interface PropertyWriteResult {
	path: string;
	result: "updated" | "failed";
	reason?: string;
}

export async function writeListChanges(
	app: App,
	file: TFile,
	key: string,
	changes: MultiSelectChanges<string>,
	strict = false,
): Promise<boolean> {
	return (await writeListChangesDetailed(app, file, key, changes, strict)).ok;
}

async function writeListChangesDetailed(
	app: App,
	file: TFile,
	key: string,
	changes: MultiSelectChanges<string>,
	strict: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
	return writeFrontmatter(app, file, `update the property ${key} of`, (frontmatter) => {
		if (strict && !isSafeListProperty(frontmatter[key]))
			throw new Error(t("cli.property.invalidValue"));
		const current = readList(frontmatter[key]);
		const next = [
			...current.filter((value) => !changes.remove.includes(value)),
			...changes.add.filter((value) => !current.includes(value)),
		];
		setOrDeleteFrontmatterList(frontmatter, key, next);
	});
}

export function isSafeListProperty(value: unknown): value is string[] | null | undefined {
	return (
		value === undefined ||
		value === null ||
		(Array.isArray(value) && value.every((item) => typeof item === "string"))
	);
}

export async function writeListChangesToFiles(
	app: App,
	files: readonly TFile[],
	key: string,
	changes: MultiSelectChanges<string>,
	expectedContents?: ReadonlyMap<string, string>,
): Promise<PropertyWriteResult[]> {
	const results: PropertyWriteResult[] = [];
	for (const file of files) {
		if (expectedContents) {
			try {
				if ((await app.vault.read(file)) !== expectedContents.get(file.path))
					throw new Error(t("merge.error.changed"));
			} catch (error) {
				results.push({
					path: file.path,
					result: "failed",
					reason: error instanceof Error ? error.message : String(error),
				});
				continue;
			}
		}
		const updated = await writeListChangesDetailed(
			app,
			file,
			key,
			changes,
			Boolean(expectedContents),
		);
		results.push(
			updated.ok
				? { path: file.path, result: "updated" }
				: { path: file.path, result: "failed", reason: updated.reason },
		);
	}
	return results;
}
