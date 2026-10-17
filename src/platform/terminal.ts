import { exec } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "src/shared/logger";
import { t } from "src/i18n";

const execAsync = promisify(exec);

/** PATH の前にある同名のシムより、Windows Terminal の実行エイリアスを優先する。 */
export function getWindowsTerminalPath(): string {
	return process.env.LOCALAPPDATA
		? `${process.env.LOCALAPPDATA}\\Microsoft\\WindowsApps\\wt.exe`
		: "wt.exe";
}

/**
 * ディレクトリでターミナルを開く、OS ごとのコマンドを組み立てる。当面は既定のシェルだけ。
 * yazi やカスタムのコマンドの設定は、後で足す。
 */
export function getTerminalCommand(platform: NodeJS.Platform, directory: string): string | null {
	switch (platform) {
		case "win32":
			// `start ""` は切り離して起動する。空のタイトルで、引用された
			// パスがタイトルとして扱われないようにする。
			return `start "" "${getWindowsTerminalPath()}" -d "${directory}"`;
		case "darwin":
			return `open -a Terminal "${directory}"`;
		case "linux":
			return `x-terminal-emulator --working-directory=${directory}`;
		default:
			return null;
	}
}

/** ファイルは親のフォルダーを開く。フォルダーは自分自身を開く。 */
export function getTerminalDirectory(absolutePath: string, isFolder: boolean): string {
	if (isFolder) return absolutePath;
	const parent = absolutePath.replace(/[\\/][^\\/]*$/, "");
	return parent || absolutePath;
}

/** システムのターミナルでディレクトリを開く。失敗したらエラーメッセージを返す。 */
export async function openDirectoryInTerminal(directory: string): Promise<string | null> {
	const command = getTerminalCommand(process.platform, directory);
	if (!command) return t("terminal.unsupported");
	try {
		await execAsync(command);
		return null;
	} catch (error) {
		logger.error(`Failed to open a terminal at ${directory}`, error);
		return t("terminal.failed", { directory });
	}
}
