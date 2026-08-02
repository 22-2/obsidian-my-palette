import type { EverythingScope } from "src/model/results";

export function buildEverythingQuery(
	vaultRoot: string,
	scope: EverythingScope,
	extensions: string[],
	query: string,
): string {
	const extensionFilter = extensions.length ? `ext:${extensions.join(";")}` : "";
	return [`path:"${vaultRoot}"`, extensionFilter, query].filter(Boolean).join(" ");
}
