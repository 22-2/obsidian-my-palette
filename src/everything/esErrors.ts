export class EsError extends Error {
	constructor(
		message: string,
		readonly kind: "configuration" | "process" | "output" = "process",
	) {
		super(message);
	}
}

export function messageForExitCode(code: number): string | null {
	const messages: Record<number, string> = {
		1: "es.exe could not initialize.",
		2: "es.exe could not initialize.",
		3: "Not enough memory to search.",
		4: "Invalid es.exe arguments.",
		5: "es.exe failed to create output.",
		6: "This es.exe version is not supported.",
		7: "Could not send the search to Everything.",
		8: "Everything 1.5a is not running or the instance name is wrong.",
	};
	if (code === 0 || code === 9) return null;
	return messages[code] ?? `Everything search failed (code ${code}).`;
}
