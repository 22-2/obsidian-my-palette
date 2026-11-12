import type { App, TFile } from "obsidian";
import { logger } from "src/shared/logger";
import { t } from "src/i18n";
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
	/** マージ先に書く、統合後の本文全体。マージ先の本文が一番上。 */
	body: string;
	sourceProperties: MergeSourceProperties[];
	/** マージ先と統合元で値が違い、マージ先の値を残すキー。 */
	conflicts: string[];
	/** 統合元へのリンクを、マージ先へ付け替えるノート。 */
	retargets: MergeRetarget[];
	/** 統合元の名前を、マージ先の `aliases` に加える。確認画面で切り替える。 */
	aliasSourceNames: boolean;
	/** 計画時に読んだ内容。実行前と削除前の変更検出に使う。 */
	snapshots: { path: string; file: TFile; content: string }[];
}

export interface MergeResult {
	/** マージ先を書き終えたか。失敗したときは、ほかのノートに触れていない。 */
	merged: boolean;
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

	const snapshots = await Promise.all(
		[...ordered, target].map(async (file) => ({
			path: file.path,
			file,
			content: await app.vault.read(file),
		})),
	);
	const readPart = ({ path, content }: (typeof snapshots)[number]): MergePart => ({
		path,
		body: splitFrontmatter(content).body,
	});
	const body = buildMergedBody(
		snapshots.slice(0, -1).map(readPart),
		readPart(snapshots[snapshots.length - 1]),
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
		snapshots,
	};
}

/**
 * 変更予定どおりに統合する。順番は、マージ先を書く → 統合元へのリンクを付け替える → 統合元をゴミ箱へ。
 * マージ先を書けなかったら、ほかのノートには触らない。統合元の内容がなくなるのを防ぐため。
 */
export async function executeMerge(app: App, plan: MergePlan): Promise<MergeResult> {
	const failures: string[] = [];
	const result: MergeResult = { merged: false, trashed: 0, retargeted: 0, failures };
	const { target } = plan;
	for (const snapshot of plan.snapshots) {
		try {
			if (
				snapshot.file.path !== snapshot.path ||
				(await app.vault.read(snapshot.file)) !== snapshot.content
			)
				throw new Error(t("merge.error.changed"));
		} catch (error) {
			failures.push(`${snapshot.path}: ${errorMessage(error)}`);
			return result;
		}
	}
	let propertiesUpdated = false;
	try {
		await app.fileManager.processFrontMatter(target, (frontmatter: Record<string, unknown>) => {
			mergeFrontmatter(frontmatter, target.basename, plan.sourceProperties, {
				aliasSourceNames: plan.aliasSourceNames,
			});
		});
		propertiesUpdated = true;
		await app.vault.process(target, (content) => {
			const current = splitFrontmatter(content);
			const original = splitFrontmatter(plan.snapshots[plan.snapshots.length - 1].content);
			if (current.body !== original.body) throw new Error(t("merge.error.changed"));
			return current.frontmatter + plan.body;
		});
	} catch (error) {
		logger.error(`Failed to merge into ${target.path}`, error);
		failures.push(`${target.basename}: ${errorMessage(error)}`);
		if (propertiesUpdated) failures.push(t("merge.error.propertiesUpdated"));
		return result;
	}
	result.merged = true;

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
	if (failures.length > 0) {
		failures.push(t("merge.error.sourcesKept"));
		return result;
	}

	for (const source of plan.sources) {
		try {
			const snapshot = plan.snapshots.find((item) => item.file === source)!;
			if (
				source.path !== snapshot.path ||
				(await app.vault.read(source)) !== snapshot.content
			)
				throw new Error(t("merge.error.changed"));
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
