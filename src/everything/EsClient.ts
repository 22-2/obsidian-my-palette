import { execFile, type ChildProcess } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import type { MyPaletteSettings } from "../model/settings";
import type { EverythingResult } from "../model/results";
import { parseEsCsv } from "./csvParser";
import { EsError, messageForExitCode } from "./esErrors";

export type ExecFile = typeof execFile;

function expandEnvironment(value: string): string {
	return value.replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`);
}

export class EsClient {
	private active: ChildProcess | null = null;
	constructor(
		private readonly run: ExecFile = execFile,
		private readonly debug?: (message: string, detail?: unknown) => void,
	) {}

	cancel(): void {
		this.active?.kill();
		this.active = null;
	}

	async validateExecutable(rawPath: string): Promise<string> {
		if (!rawPath.trim())
			throw new EsError("Set the es.exe path in My Palette settings.", "configuration");
		const executable = path.resolve(expandEnvironment(rawPath.trim()));
		if (!path.isAbsolute(executable) || path.extname(executable).toLocaleLowerCase() !== ".exe")
			throw new EsError("The es.exe path must be an absolute .exe path.", "configuration");
		try {
			if (!(await fs.stat(executable)).isFile()) throw new Error("not a file");
		} catch {
			throw new EsError("es.exe was not found or is not a regular file.", "configuration");
		}
		return executable;
	}

	async search(
		query: string,
		settings: MyPaletteSettings["everything"],
		signal?: AbortSignal,
		limit = settings.maxResults,
	): Promise<EverythingResult[]> {
		const executable = await this.validateExecutable(settings.esPath);
		if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
		this.cancel();
		const args = [
			"-instance",
			settings.instanceName,
			"-n",
			String(Math.min(500, Math.max(1, limit))),
			"-csv",
			"-no-header",
			"-full-path-and-name",
			"-attributes",
			"-cp",
			"65001",
			"-timeout",
			String(settings.esTimeoutMs),
			"--",
			query,
		];
		this.debug?.("Running es.exe", args);
		return await new Promise<EverythingResult[]>((resolve, reject) => {
			let settled = false;
			const finish = (callback: () => void): void => {
				if (settled) return;
				settled = true;
				signal?.removeEventListener("abort", onAbort);
				callback();
			};
			const child = this.run(
				executable,
				args,
				{
					shell: false,
					windowsHide: true,
					timeout: settings.processTimeoutMs,
					maxBuffer: 1024 * 1024,
					encoding: "utf8",
				},
				(error, stdout) => {
					if (this.active === child) this.active = null;
					if (signal?.aborted) {
						finish(() => reject(new DOMException("Aborted", "AbortError")));
						return;
					}
					if (error) {
						const err = error as NodeJS.ErrnoException & {
							killed?: boolean;
							code?: string | number;
						};
						let message: string;
						if (err.code === "ENOENT") message = "es.exe was not found.";
						else if (err.code === "EACCES")
							message =
								"Permission denied. Check that Obsidian and Everything use compatible privilege levels.";
						else if (err.killed) message = "Everything search timed out.";
						else if (typeof err.code === "number")
							message = messageForExitCode(err.code) ?? "No results";
						else if (err.message.toLocaleLowerCase().includes("maxbuffer"))
							message = "Everything returned more than 1 MiB of output.";
						else message = "Everything search failed.";
						finish(() => reject(new EsError(message)));
						return;
					}
					try {
						finish(() =>
							resolve(parseEsCsv(String(stdout), (message) => this.debug?.(message))),
						);
					} catch (parseError) {
						finish(() => reject(parseError));
					}
				},
			);
			this.active = child;
			const onAbort = (): void => {
				child.kill();
				finish(() => reject(new DOMException("Aborted", "AbortError")));
			};
			signal?.addEventListener("abort", onAbort, { once: true });
		});
	}
}
