import { PALETTE_MODES } from "src/core/modes";
import type { GitCommitResult } from "src/core/results";
import type {
	PaletteNavigationFrame,
	PaletteRoute,
} from "src/features/palette/PaletteSearchSession";

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCommit(value: unknown): value is GitCommitResult {
	if (!isRecord(value)) return false;
	return (
		value.mode === "git" &&
		value.kind === "commit" &&
		typeof value.id === "string" &&
		typeof value.primary === "string" &&
		typeof value.secondary === "string" &&
		typeof value.icon === "string" &&
		typeof value.hash === "string" &&
		/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value.hash) &&
		Array.isArray(value.parents) &&
		value.parents.every(
			(parent: unknown) =>
				typeof parent === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(parent),
		)
	);
}

function isRoute(value: unknown): value is PaletteRoute {
	if (!isRecord(value)) return false;
	if (value.kind === "home" || value.kind === "other") return true;
	if (value.kind !== "mode" || !PALETTE_MODES.some((mode) => mode.id === value.modeId))
		return false;
	if (value.page === undefined) return true;
	return (
		value.modeId === "git" &&
		isRecord(value.page) &&
		value.page.kind === "git-commit" &&
		isCommit(value.page.commit)
	);
}

function isFrame(value: unknown): value is PaletteNavigationFrame {
	if (
		!isRecord(value) ||
		!isRoute(value.route) ||
		typeof value.input !== "string" ||
		!isRecord(value.view)
	)
		return false;
	const { activeIndex, scrollTop, id } = value.view;
	return (
		typeof activeIndex === "number" &&
		Number.isInteger(activeIndex) &&
		activeIndex >= -1 &&
		typeof scrollTop === "number" &&
		Number.isFinite(scrollTop) &&
		scrollTop >= 0 &&
		(id === undefined || typeof id === "string")
	);
}

/** 読み直したワークスペースの状態は不正かもしれないので、階層ごと確認する。 */
export function normalizeSavedNavigation(
	route: unknown,
	navigation: unknown,
): { route: PaletteRoute; navigation: PaletteNavigationFrame[] } | undefined {
	if (
		!isRoute(route) ||
		route.kind !== "mode" ||
		!route.page ||
		!Array.isArray(navigation) ||
		!navigation.length ||
		!navigation.every(isFrame)
	)
		return;
	return { route, navigation };
}
