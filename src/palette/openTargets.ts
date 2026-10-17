import { isMarkdownPath } from "src/shared/externalFiles";

/**
 * 検索結果が解決されたあと、パスをどこで開くかを表す。この判断を分けておくと、
 * ファイルの結果と Everything の結果が同じ外部ファイルの挙動を共有できる。
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
