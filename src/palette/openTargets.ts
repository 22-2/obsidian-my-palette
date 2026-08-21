import { isMarkdownPath } from "src/core/externalFiles";

/**
 * Describes where a path should be opened after a search result has been
 * resolved. Keeping this decision separate lets file and Everything results
 * share the same external-file behavior.
 */
export type ExternalOpenTarget =
	| { kind: "readonly-markdown"; absolutePath: string }
	| { kind: "code"; absolutePath: string }
	| { kind: "system"; absolutePath: string };

export interface ExternalOpenTargetOptions {
	openMarkdownInObsidian: boolean;
	ignored: boolean;
}

export function resolveExternalOpenTarget(
	absolutePath: string,
	{ openMarkdownInObsidian, ignored }: ExternalOpenTargetOptions,
): ExternalOpenTarget {
	if (isMarkdownPath(absolutePath) && openMarkdownInObsidian)
		return { kind: "readonly-markdown", absolutePath };
	if (ignored) return { kind: "code", absolutePath };
	return { kind: "system", absolutePath };
}
