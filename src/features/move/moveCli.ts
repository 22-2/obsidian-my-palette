import type { CliApi } from "src/platform/cliApi";
import { TFile, TFolder } from "obsidian";
import { cliPlanHash, cliTargetPaths, requireCliPlan } from "src/platform/cliPlans";
import { moveFiles } from "src/features/move/moveFiles";
import { t } from "src/i18n";

export const moveCliApi: CliApi = {
	action: "move",
	description: t("cli.move.description"),
	flags: {
		paths: { value: "<json>", description: t("cli.rename.pathsFlag"), required: true },
		folder: { value: "<path>", description: t("cli.move.folderFlag"), required: true },
		apply: { description: t("cli.rename.applyFlag") },
		plan: { value: "<hash>", description: t("cli.rename.planFlag") },
	},
	run: async (plugin, params) => {
		const { app } = plugin;
		const paths = cliTargetPaths(app, params.paths);
		const folder = params.folder === "/" ? "" : params.folder;
		if (
			folder === undefined ||
			(folder !== "" && !(app.vault.getAbstractFileByPath(folder) instanceof TFolder))
		)
			throw new Error(t("cli.move.folderMissing"));
		const occupied = new Set(
			app.vault.getAllLoadedFiles().map((file) => file.path.toLowerCase()),
		);
		const destinations = paths.map((path) =>
			folder ? `${folder}/${path.split("/").pop()!}` : path.split("/").pop()!,
		);
		const counts = new Map<string, number>();
		for (const dest of destinations)
			counts.set(dest.toLowerCase(), (counts.get(dest.toLowerCase()) ?? 0) + 1);
		const items = paths.map((path, index) => {
			const destination = destinations[index];
			const status =
				destination === path
					? "unchanged"
					: counts.get(destination.toLowerCase())! > 1
						? "duplicate"
						: occupied.has(destination.toLowerCase())
							? "exists"
							: "ready";
			return { path, destination, status };
		});
		const plan = cliPlanHash({ folder, items });
		const blocked = items.some(
			(item) => item.status === "duplicate" || item.status === "exists",
		);
		if (params.apply !== "true") return { action: "preview", blocked, plan, items };
		requireCliPlan(params.plan, plan);
		if (blocked) throw new Error(t("cli.move.blocked"));
		const files = paths.map((path) => {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) throw new Error(t("cli.rename.fileMissing", { path }));
			return file;
		});
		return { action: "move", plan, items: await moveFiles(app, files, folder) };
	},
};
