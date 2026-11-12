import { ICONS } from "src/core/icons";
import type { RenamePlanRow, RenameStatus } from "src/features/rename/renamePlan";
import type { SelectionItem } from "src/ui/selectionModal";
import { t } from "src/i18n";

/** 名前変更の一覧の1行。計画の行をそのまま持つ。 */
export interface RenameItem extends SelectionItem {
	row: RenamePlanRow;
}

const STATUS_BADGE: Record<RenameStatus, string | undefined> = {
	ready: undefined,
	unchanged: t("rename.status.unchanged"),
	invalid: t("rename.status.invalid"),
	exists: t("rename.status.exists"),
	duplicate: t("rename.status.duplicate"),
};

function directoryOf(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash < 0 ? "/" : path.slice(0, slash);
}

export function toRenameItem(row: RenamePlanRow): RenameItem {
	const changed = row.status !== "unchanged";
	return {
		label: changed ? `${row.oldName} → ${row.newName}` : row.oldName,
		description: directoryOf(row.path),
		icon: row.status === "ready" ? ICONS.ready : changed ? ICONS.warning : ICONS.file,
		badge: STATUS_BADGE[row.status],
		row,
	};
}
