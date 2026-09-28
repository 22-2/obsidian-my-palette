import { isMarkdownPath } from "src/shared/externalFiles";

/**
 * Describes where a path should be opened after a search result has been
 * resolved. Keeping this decision separate lets file and Everything results
 * share the same external-file behavior.
 */
export type ExternalOpenTarget =
	| { kind: "markdown"; absolutePath: string }
	| { kind: "system"; absolutePath: string };

export interface ExternalOpenTargetOptions {
	openMarkdownInObsidian: boolean;
}

export function resolveExternalOpenTarget(
	absolutePath: string,
	{ openMarkdownInObsidian }: ExternalOpenTargetOptions,
): ExternalOpenTarget {
	// なぜMarkdownのみ分岐するか: ignoredを含む非MarkdownはOS関連付け(system)で
	// 開く方針のため、エディター指定(code)は不要。
	if (isMarkdownPath(absolutePath) && openMarkdownInObsidian)
		return { kind: "markdown", absolutePath };
	return { kind: "system", absolutePath };
}
