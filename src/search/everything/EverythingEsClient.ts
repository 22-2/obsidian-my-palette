import { execFile, type ChildProcess } from "child_process";
import type { MyPaletteSettings } from "src/settings/model";
import type { EverythingResult } from "src/palette/results";
import { t } from "src/i18n";

interface EsJsonItem {
	filename?: unknown;
	attributes?: unknown;
}

/** FILE_ATTRIBUTE_DIRECTORY。es.exe の JSON は属性を数値で返す。 */
const DIRECTORY_ATTRIBUTE = 0x10;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const ES_PATH_ENV = "MY_PALETTE_ES_PATH";
const ES_QUERY_ENV = "MY_PALETTE_ES_QUERY";

/**
 * es.exe（Everything のコマンドライン）で検索する。HTTP サーバーと違い、Everything 本体と
 * IPC で話すので、接続の詰まりやポート設定に左右されない。検索のたびに子プロセスを起動するため、
 * 中断は kill で確実に効く。
 */
export class EverythingEsClient {
	private readonly active = new Set<ChildProcess>();

	constructor(private readonly debug?: (message: string, detail?: unknown) => void) {}

	cancel(): void {
		for (const child of this.active) child.kill();
		this.active.clear();
	}

	async search(
		query: string,
		settings: MyPaletteSettings["everything"],
		signal?: AbortSignal,
		limit = settings.maxResults,
	): Promise<EverythingResult[]> {
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		const count = String(Math.min(500, Math.max(1, limit)));
		this.debug?.("Running es.exe", { esPath: settings.esPath, count, query });
		return parseEsJson(await this.run(settings, count, query, signal));
	}

	/**
	 * Why: es.exe の標準出力は OS のコードページ（日本語環境では CP932）になり文字化けする。
	 * cmd 経由で chcp 65001 にしてから起動し、UTF-8 のまま受け取る。
	 * 検索語とパスは cmd に解釈されないよう環境変数で渡し、遅延展開（!VAR!）で参照する。
	 * 遅延展開は構文の解析後に行われるので、`&` や `|` を含んでもコマンドにならない。
	 * es.exe はコマンドライン全体を自分で解釈するため、空白入りのクエリを 1 語にしないよう
	 * 引数は verbatim で渡す。`--` 以降は検索語なので、クエリ中のオプションは効かない。
	 */
	private run(
		settings: MyPaletteSettings["everything"],
		count: string,
		query: string,
		signal?: AbortSignal,
	): Promise<string> {
		return new Promise((resolve, reject) => {
			let aborted = false;
			const commandLine = `"chcp 65001 >nul & "!${ES_PATH_ENV}!" -n ${count} -json -full-path-and-name -attributes -- !${ES_QUERY_ENV}!"`;
			const child = execFile(
				"cmd.exe",
				["/d", "/v:on", "/s", "/c", commandLine],
				{
					encoding: "buffer",
					windowsHide: true,
					windowsVerbatimArguments: true,
					timeout: settings.requestTimeoutMs,
					maxBuffer: MAX_OUTPUT_BYTES,
					env: { ...process.env, [ES_PATH_ENV]: settings.esPath, [ES_QUERY_ENV]: query },
				},
				(error, stdout) => {
					this.active.delete(child);
					signal?.removeEventListener("abort", abort);
					if (aborted) return reject(new DOMException("Aborted", "AbortError"));
					if (error) return reject(toEsError(error, settings.esPath));
					resolve(stdout.toString("utf8"));
				},
			);
			const abort = () => {
				aborted = true;
				child.kill();
			};
			this.active.add(child);
			signal?.addEventListener("abort", abort, { once: true });
		});
	}
}

function toEsError(
	error: Error & { code?: string | number; killed?: boolean },
	esPath: string,
): Error {
	if (error.killed) return new Error(t("everything.error.esTimeout"));
	// es.exe の終了コード 8 は、Everything が起動していないときの IPC エラー。
	if (error.code === 8) return new Error(t("everything.error.esIpc"));
	// cmd は、コマンドが見つからないときに終了コード 1 を返す（es.exe 自身は 1 を返さない）。
	if (error.code === 1) return new Error(t("everything.error.esNotFound", { path: esPath }));
	return new Error(t("everything.error.esFailed", { message: error.message }));
}

export function parseEsJson(body: string): EverythingResult[] {
	// 結果が 0 件のとき、es.exe は何も出力しない。
	if (!body.trim()) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		throw new Error(t("everything.error.invalidJson"));
	}
	if (!Array.isArray(parsed)) throw new Error(t("everything.error.format"));
	return parsed.flatMap((raw: EsJsonItem): EverythingResult[] => {
		if (typeof raw.filename !== "string") return [];
		// フォルダーのパスは末尾に区切りが付く。
		const absolutePath = raw.filename.replace(/[\\/]+$/, "");
		if (!/^[a-z]:[\\/]/i.test(absolutePath) && !absolutePath.startsWith("\\\\")) return [];
		const attributes = typeof raw.attributes === "number" ? raw.attributes : 0;
		const kind = attributes & DIRECTORY_ATTRIBUTE ? "folder" : "file";
		const cut = Math.max(absolutePath.lastIndexOf("\\"), absolutePath.lastIndexOf("/"));
		return [
			{
				id: absolutePath.toLocaleLowerCase(),
				mode: "everything",
				primary: absolutePath.slice(cut + 1),
				secondary: cut < 0 ? "" : absolutePath.slice(0, cut),
				icon: kind,
				absolutePath,
				scope: "directory",
				attributes: attributes & DIRECTORY_ATTRIBUTE ? "D" : "",
				kind,
			},
		];
	});
}
