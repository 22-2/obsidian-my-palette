import type { App, TFile } from "obsidian";
import { writeFrontmatter } from "src/core/frontmatter";
import type { InputPropertyKind } from "src/properties/propertyInput";
import { t } from "src/i18n";

export type ScalarPropertyKind = InputPropertyKind | "checkbox";
export type ScalarPropertyValue = string | number | boolean;

/** 型の異なる値や複合値を、CLI から黙って上書きしない。 */
export function isCompatibleScalar(value: unknown, kind: ScalarPropertyKind): boolean {
	if (value === undefined || value === null || value === "") return true;
	if (kind === "checkbox") return typeof value === "boolean";
	if (kind === "number") return typeof value === "number" && Number.isFinite(value);
	return typeof value === "string";
}

export async function writeScalarProperty(
	app: App,
	file: TFile,
	key: string,
	value: ScalarPropertyValue,
	options?: { kind: ScalarPropertyKind; expectedContent: string },
): Promise<{ ok: true } | { ok: false; reason: string }> {
	if (options) {
		try {
			if ((await app.vault.read(file)) !== options.expectedContent)
				throw new Error(t("merge.error.changed"));
		} catch (error) {
			return { ok: false, reason: error instanceof Error ? error.message : String(error) };
		}
	}
	return writeFrontmatter(app, file, `update the property ${key} of`, (frontmatter) => {
		if (options && !isCompatibleScalar(frontmatter[key], options.kind))
			throw new Error(t("cli.scalar.invalidValue"));
		frontmatter[key] = value;
	});
}
