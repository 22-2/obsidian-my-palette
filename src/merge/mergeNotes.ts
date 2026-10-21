import type { App, TFile } from "obsidian";
import { logger } from "src/shared/logger";
import {
	buildMergedBody,
	mergeFrontmatter,
	retargetLinks,
	splitFrontmatter,
	type LinkResolver,
	type MergePart,
	type MergeSourceProperties,
} from "src/merge/mergeText";

export interface MergeRetarget {
	file: TFile;
	count: number;
}

/** 統合の変更予定。ファイルには何も書かず、確認画面に出す内容だけを持つ。 */
export interface MergePlan {
	target: TFile;
	/** パス順に並んだ統合元。マージ先は含まない。 */
	sources: TFile[];
	/** マージ先に書く、統合後の本文全体。 */
	body: string;
	sourceProperties: MergeSourceProperties[];
	/** マージ先と統合元で値が違い、マージ先の値を残すキー。 */
	conflicts: string[];
	/** 統合元へのリンクを、マージ先へ付け替えるノート。 */
	retargets: MergeRetarget[];
	/** 統合元の名前を、マージ先の `aliases` に加える。確認画面で切り替える。 */
	aliasSourceNames: boolean;
}

export interface MergeResult {
	/** 統合元をゴミ箱に移した数。 */
	trashed: number;
	/** リンクを付け替えたノートの数。 */
	retargeted: number;
	failures: string[];
}

function resolverFor(app: App): LinkResolver {
	return (linkpath, fromPath) =>
		app.metadataCache.getFirstLinkpathDest(linkpath, fromPath)?.path ?? null;
}

function copyFrontmatter(value: unknown): Record<string, unknown> {
	return JSON.parse(JSON.stringify(value ?? {})) as Record<string, unknown>;
}

/**
 * 統合の変更予定を組み立てる。統合元とマージ先の本文を読み、統合後の本文、プロパティの衝突、
 * リンクを付け替えるノートを調べる。どのファイルも書き換えない。
 */
export async function planMerge(
	app: App,
	sources: readonly TFile[],
	target: TFile,
): Promise<MergePlan> {
	const ordered = sources
		.filter((file) => file.path !== target.path)
		.sort((a, b) => a.path.localeCompare(b.path));
	const moved = new Set(ordered.map((file) => file.path));
	const group = new Set([...moved, target.path]);
	const resolve = resolverFor(app);

	const readPart = async (file: TFile): Promise<MergePart> => ({
		path: file.path,
		body: splitFrontmatter(await app.vault.cachedRead(file)).body,
	});
	const body = buildMergedBody(
		await Promise.all(ordered.map(readPart)),
		await readPart(target),
		group,
		resolve,
	);

	const retargets: MergeRetarget[] = [];
	const links = app.metadataCache.resolvedLinks;
	for (const [fromPath, targets] of Object.entries(links)) {
		if (group.has(fromPath) || !Object.keys(targets).some((path) => moved.has(path))) continue;
		const file = app.vault.getFileByPath(fromPath);
		if (!file) continue;
		const result = retargetLinks(
			await app.vault.cachedRead(file),
			fromPath,
			{ path: target.path, basename: target.basename },
			moved,
			resolve,
		);
		if (result.count > 0) retargets.push({ file, count: result.count });
	}

	const sourceProperties = ordered.map((file) => ({
		basename: file.basename,
		frontmatter: copyFrontmatter(app.metadataCache.getFileCache(file)?.frontmatter),
	}));
	const aliasSourceNames = true;
	const conflicts = mergeFrontmatter(
		copyFrontmatter(app.metadataCache.getFileCache(target)?.frontmatter),
		target.basename,
		sourceProperties,
		{ aliasSourceNames },
	);

	return {
		target,
		sources: ordered,
		body,
		sourceProperties,
		conflicts,
		retargets,
		aliasSourceNames,
	};
}

/**
 * 変更予定どおりに統合する。順番は、マージ先を書く → 統合元へのリンクを付け替える → 統合元をゴミ箱へ。
 * マージ先を書けなかったら、ほかのノートには触らない。統合元の内容がなくなるのを防ぐため。
 */
export async function executeMerge(app: App, plan: MergePlan): Promise<MergeResult> {
	const failures: string[] = [];
	const result: MergeResult = { trashed: 0, retargeted: 0, failures };
	const { target } = plan;
	try {
		await app.fileManager.processFrontMatter(target, (frontmatter: Record<string, unknown>) => {
			mergeFrontmatter(frontmatter, target.basename, plan.sourceProperties, {
				aliasSourceNames: plan.aliasSourceNames,
			});
		});
		await app.vault.process(
			target,
			(content) => splitFrontmatter(content).frontmatter + plan.body,
		);
	} catch (error) {
		logger.error(`Failed to merge into ${target.path}`, error);
		failures.push(`${target.basename}: ${errorMessage(error)}`);
		return result;
	}

	const moved = new Set(plan.sources.map((file) => file.path));
	const resolve = resolverFor(app);
	for (const { file } of plan.retargets) {
		try {
			await app.vault.process(
				file,
				(content) =>
					retargetLinks(
						content,
						file.path,
						{ path: target.path, basename: target.basename },
						moved,
						resolve,
					).content,
			);
			result.retargeted++;
		} catch (error) {
			logger.error(`Failed to retarget links in ${file.path}`, error);
			failures.push(`${file.basename}: ${errorMessage(error)}`);
		}
	}

	for (const source of plan.sources) {
		try {
			await app.fileManager.trashFile(source);
			result.trashed++;
		} catch (error) {
			logger.error(`Failed to trash ${source.path}`, error);
			failures.push(`${source.basename}: ${errorMessage(error)}`);
		}
	}
	return result;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
