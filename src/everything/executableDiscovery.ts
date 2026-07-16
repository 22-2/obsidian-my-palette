import { access } from "fs/promises";
import * as path from "path";

export async function discoverEsExecutables(savedPath: string): Promise<string[]> {
	const candidates = [
		savedPath,
		...String(process.env.PATH ?? "")
			.split(path.delimiter)
			.map((directory) => path.join(directory, "es.exe")),
		"C:\\Program Files\\Everything 1.5a\\es.exe",
		"C:\\Program Files\\Everything\\es.exe",
	];
	const found: string[] = [];
	for (const candidate of candidates) {
		if (
			!candidate ||
			found.some((value) => value.toLocaleLowerCase() === candidate.toLocaleLowerCase())
		)
			continue;
		try {
			await access(candidate);
			found.push(candidate);
		} catch {
			/* Candidate does not exist. */
		}
	}
	return found;
}
