import * as path from "path";
import type { EverythingResult } from "../model/results";
import { EsError } from "./esErrors";

export function parseCsvRows(input: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = "";
	let quoted = false;
	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		if (quoted) {
			if (char === '"' && input[index + 1] === '"') {
				cell += '"';
				index += 1;
			} else if (char === '"') quoted = false;
			else cell += char;
		} else if (char === '"' && cell.length === 0) quoted = true;
		else if (char === ",") {
			row.push(cell);
			cell = "";
		} else if (char === "\r" || char === "\n") {
			if (char === "\r" && input[index + 1] === "\n") index += 1;
			row.push(cell);
			cell = "";
			if (row.some(Boolean)) rows.push(row);
			row = [];
		} else cell += char;
	}
	if (cell || row.length) {
		row.push(cell);
		if (row.some(Boolean)) rows.push(row);
	}
	return rows;
}

export function parseEsCsv(input: string, debug?: (message: string) => void): EverythingResult[] {
	const seen = new Set<string>();
	const results: EverythingResult[] = [];
	let invalid = 0;
	for (const row of parseCsvRows(input)) {
		const absolutePath = row[0] ?? "";
		const attributes = row[1] ?? "";
		if (row.length < 2 || !path.win32.isAbsolute(absolutePath) || absolutePath.includes("\0")) {
			invalid += 1;
			debug?.(`Ignored malformed es.exe row: ${JSON.stringify(row)}`);
			continue;
		}
		const key = absolutePath.toLocaleLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		const kind = attributes.toUpperCase().includes("D") ? "folder" : "file";
		results.push({
			id: key,
			mode: "everything",
			primary: path.win32.basename(absolutePath),
			secondary: path.win32.dirname(absolutePath),
			icon: kind,
			absolutePath,
			attributes,
			kind,
		});
	}
	if (input.trim() && invalid > 0 && results.length === 0)
		throw new EsError("es.exe returned an unsupported output format.", "output");
	return results;
}
