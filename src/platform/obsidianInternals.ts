import type {
	App,
	EditorRange,
	KeymapEventHandler,
	MarkdownView,
	Scope,
	TAbstractFile,
} from "obsidian";

/*
 * 公開の `obsidian` の型定義にない Obsidian の API は、すべてこのモジュールを通す。
 * Why: これらの API は、どの Obsidian のリリースでも変わったり消えたりしうる。そのため、各アクセサーは
 * 読むものを確認し、例外を投げる代わりに空または欠けた値へフォールバックする。更新で1つが壊れたら、
 * 直すべきファイルはこれだけ。
 */

/** 任意のメンバー。内部のものが欠けていても、例外ではなく undefined として読めるようにする。 */
interface AppInternals {
	commands?: {
		commands?: Record<string, { id: string; name: string }>;
		executeCommandById?: (id: string) => boolean;
	};
	plugins?: {
		manifests?: Record<string, CommunityPluginManifest>;
		plugins?: Record<string, unknown>;
	};
	internalPlugins?: {
		getEnabledPluginById?: (id: string) => unknown;
	};
	customCss?: CustomCssInternals;
	setting?: SettingWindowInternals;
	metadataTypeManager?: MetadataTypeManagerInternals;
	metadataCache?: {
		getFrontmatterPropertyValuesForKey?: (key: string) => unknown;
	};
	vault?: {
		getConfig?: (key: string) => unknown;
	};
	viewRegistry?: {
		isExtensionRegistered?: (extension: string) => boolean;
	};
}

interface AdapterInternals {
	getBasePath?: () => string;
	getFullPath?: (vaultPath: string) => string;
}

export interface CommunityPluginManifest {
	id: string;
	name: string;
	version: string;
	dir?: string;
}

export interface CustomCssInternals {
	snippets?: unknown;
	enabledSnippets?: unknown;
	getSnippetsFolder?: () => string;
	getSnippetPath?: (snippet: string) => string;
}

export interface SettingWindowInternals {
	open(): void;
	openTabById(id: string): void;
	/** プラグインが登録するタブ。settingTabs は Obsidian 自身のページだけを持つ。 */
	pluginTabs?: readonly { id?: string }[];
}

export interface VaultPropertyInfo {
	type?: unknown;
	widget?: unknown;
}

export interface MetadataTypeManagerInternals {
	getAllProperties?: () => Record<string, VaultPropertyInfo>;
	getPropertyOccurrences?: () => Record<string, number>;
	getAssignedWidget?: (key: string) => unknown;
}

/** コアの検索プラグインの入口。 */
export interface GlobalSearchInternals {
	openGlobalSearch(query: string, active: boolean): void;
}

interface MarkdownViewInternals {
	editMode?: {
		highlightSearchMatches?: (ranges: EditorRange[]) => void;
	};
}

function internals(app: App): AppInternals {
	return app as unknown as AppInternals;
}

/** 登録されているすべてのコマンド。ほかのプラグインのものと Obsidian 自身のものを含む。 */
export function getCommands(app: App): { id: string; name: string }[] {
	return Object.values(internals(app).commands?.commands ?? {});
}

/** ID でコマンドを実行する。ID が不明、または API がなければ false。 */
export function executeCommandById(app: App, id: string): boolean {
	return internals(app).commands?.executeCommandById?.(id) ?? false;
}

/** インストール済みのコミュニティプラグイン。有効かどうかは問わない。 */
export function getCommunityPluginManifests(app: App): CommunityPluginManifest[] {
	return Object.values(internals(app).plugins?.manifests ?? {});
}

/** 有効なコミュニティプラグインの、読み込まれたインスタンス。 */
export function getCommunityPlugin<T = unknown>(app: App, id: string): T | undefined {
	return (internals(app).plugins?.plugins?.[id] as T | undefined) ?? undefined;
}

/** 有効なコアプラグインのインスタンス。オフなら undefined。 */
export function getEnabledCorePlugin<T = unknown>(app: App, id: string): T | undefined {
	return (internals(app).internalPlugins?.getEnabledPluginById?.(id) as T | null) ?? undefined;
}

/**
 * Obsidian がその拡張子のビュー(ノート、キャンバス、画像、PDF、音声など)を持つかどうか。
 * `.toml` のようなファイルは「すべてのファイル拡張子を検出」の設定でのみ現れ、開けない。
 * 拡張子のないファイル(`LICENSE` など)は、登録の有無によらず開けないものとして扱う。
 * API がなければ true。変わった内部のせいで、何も隠れないようにするため。
 */
export function isExtensionOpenable(app: App, extension: string): boolean {
	if (extension === "") return false;
	return internals(app).viewRegistry?.isExtensionRegistered?.(extension) ?? true;
}

/** デイリーノートやテンプレートなど、有効なコアプラグインのフォルダー設定。 */
export function getCorePluginFolder(app: App, id: string): string | undefined {
	const folder = getEnabledCorePlugin<{ options?: { folder?: unknown } }>(app, id)?.options
		?.folder;
	return typeof folder === "string" ? folder : undefined;
}

/** ファイルまたはフォルダーをファイルエクスプローラーに表示する。そのコアプラグインがオフなら false。 */
export function revealInFileExplorer(app: App, file: TAbstractFile): boolean {
	const explorer = getEnabledCorePlugin<{ revealInFolder?: (file: TAbstractFile) => void }>(
		app,
		"file-explorer",
	);
	if (!explorer?.revealInFolder) return false;
	explorer.revealInFolder(file);
	return true;
}

export function getGlobalSearch(app: App): GlobalSearchInternals | undefined {
	return getEnabledCorePlugin<GlobalSearchInternals>(app, "global-search");
}

/** CSS スニペットの状態。API がなければ空のオブジェクト。 */
export function getCustomCss(app: App): CustomCssInternals {
	return internals(app).customCss ?? {};
}

export function getSettingWindow(app: App): SettingWindowInternals | undefined {
	return internals(app).setting;
}

export function getMetadataTypeManager(app: App): MetadataTypeManagerInternals | undefined {
	return internals(app).metadataTypeManager;
}

/** Vault のどこでも、そのフロントマターのキーに使われている値。検証はしない。 */
export function getFrontmatterValuesForKey(app: App, key: string): unknown {
	return internals(app).metadataCache?.getFrontmatterPropertyValuesForKey?.(key);
}

/** ファイルとリンクの設定(`userIgnoreFilters` など)。検証はしない。 */
export function getVaultConfig(app: App, key: string): unknown {
	return internals(app).vault?.getConfig?.(key);
}

/** ディスク上の Vault のフォルダー。デスクトップ以外では undefined。テストで渡せるように、Vault だけを受け取る。 */
export function getVaultBasePath(vault: { adapter: object }): string | undefined {
	return (vault.adapter as AdapterInternals).getBasePath?.();
}

/** Vault のパスの絶対パス。デスクトップ以外では undefined。 */
export function getVaultFullPath(app: App, vaultPath: string): string | undefined {
	return (app.vault.adapter as AdapterInternals).getFullPath?.(vaultPath);
}

/**
 * 検索の一致と同じ見た目で、Markdown のエディターの範囲を強調する。ビューの強調のAPIがなければ何もしない。
 */
export function highlightEditorRanges(view: MarkdownView, ranges: EditorRange[]): void {
	(view as unknown as MarkdownViewInternals).editMode?.highlightSearchMatches?.(ranges);
}

/** スコープに登録されたハンドラー。組み込みのものを置き換えられるように。 */
export function getScopeHandlers(scope: Scope): readonly KeymapEventHandler[] {
	return [...((scope as unknown as { keys?: KeymapEventHandler[] }).keys ?? [])];
}
