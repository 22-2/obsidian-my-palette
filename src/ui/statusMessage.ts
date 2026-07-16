export type UiStatus = "idle" | "loading" | "success" | "empty" | "error";

export function statusText(status: UiStatus, count: number, everythingEmpty = false): string {
	if (everythingEmpty) return "Type a search query";
	if (status === "loading") return "Searching…";
	if (status === "empty") return "No results";
	return `${count} result${count === 1 ? "" : "s"}`;
}
