import * as path from "path";

export function isMarkdownPath(absolutePath: string): boolean {
	return path.win32.extname(absolutePath).toLocaleLowerCase() === ".md";
}
