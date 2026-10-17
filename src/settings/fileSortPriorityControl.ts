import { DropdownComponent, type Setting } from "obsidian";
import {
	FILE_SORT_PRIORITIES,
	FILE_SORT_PRIORITY_OPTIONS,
	type FileSortPriorities,
	type FileSortPriority,
	type FileSortState,
} from "src/settings/model";
import { moveByInsertionIndex } from "src/settings/fileSortPriorityOrdering";
import { t } from "src/i18n";

/** 保存される値(英語のトークン)に対応する、表示名。並べ替えの名前は data.json に残すので、表示だけを訳す。 */
const SORT_PRIORITY_LABELS: Partial<Record<FileSortPriority, string>> = {
	[FILE_SORT_PRIORITIES.filenamePrefixMatch]: t("sort.label.filenamePrefixMatch"),
	[FILE_SORT_PRIORITIES.aliasPrefixMatch]: t("sort.label.aliasPrefixMatch"),
	[FILE_SORT_PRIORITIES.filenameFuzzyMatch]: t("sort.label.filenameFuzzyMatch"),
	[FILE_SORT_PRIORITIES.aliasFuzzyMatch]: t("sort.label.aliasFuzzyMatch"),
	[FILE_SORT_PRIORITIES.tagMatch]: t("sort.label.tagMatch"),
	[FILE_SORT_PRIORITIES.matchCoverage]: t("sort.label.matchCoverage"),
	[FILE_SORT_PRIORITIES.folderPathMatch]: t("sort.label.folderPathMatch"),
	[FILE_SORT_PRIORITIES.lowerPriorFolders]: t("sort.label.lowerPriorFolders"),
	[FILE_SORT_PRIORITIES.activity]: t("sort.label.activity"),
	[FILE_SORT_PRIORITIES.lastModified]: t("sort.label.lastModified"),
	[FILE_SORT_PRIORITIES.aliasesCount]: t("sort.label.aliasesCount"),
	[FILE_SORT_PRIORITIES.alphabetical]: t("sort.label.alphabetical"),
	[FILE_SORT_PRIORITIES.alphabeticalReverse]: t("sort.label.alphabeticalReverse"),
};

function sortPriorityLabel(priority: FileSortPriority): string {
	return SORT_PRIORITY_LABELS[priority] ?? priority;
}

const STATE_LABELS: Record<FileSortState, string> = {
	blank: t("settings.sort.onBlank"),
	input: t("settings.sort.onInput"),
};

/**
 * Office 風の二段のリストを、Obsidian の通常の操作とは分けて描く。並び順・有効かどうか・
 * 検索の状態が、1つの不可分な値を成すため。
 */
export function renderFileSortPriorityControl(
	setting: Setting,
	priorities: FileSortPriorities,
	onChange: () => Promise<void>,
): void {
	setting.settingEl.addClass("my-palette-sort-priorities-setting");
	const control = setting.controlEl;
	const stateRow = control.createDiv({ cls: "my-palette-sort-priorities__state" });
	stateRow.createSpan({ text: t("settings.sort.applyWhen") });
	let state: FileSortState = "blank";
	let selectedEnabled: FileSortPriority | undefined;
	let selectedDisabled: FileSortPriority | undefined;
	let draggedIndex: number | undefined;
	let dropIndex: number | undefined;

	const dropdown = new DropdownComponent(stateRow);
	for (const [value, label] of Object.entries(STATE_LABELS)) dropdown.addOption(value, label);

	const dualList = control.createDiv({ cls: "my-palette-sort-priorities__dual-list" });
	const enabledColumn = dualList.createDiv({ cls: "my-palette-sort-priorities__column" });
	enabledColumn.createDiv({
		cls: "my-palette-sort-priorities__label",
		text: t("settings.sort.enabled"),
	});
	const enabledList = enabledColumn.createDiv({
		cls: "my-palette-sort-priorities__list",
	});
	const transferButtons = dualList.createDiv({ cls: "my-palette-sort-priorities__buttons" });
	const enableButton = transferButtons.createEl("button", {
		text: "←",
		attr: { type: "button", "aria-label": t("settings.sort.enableAria") },
	});
	const disableButton = transferButtons.createEl("button", {
		text: "→",
		attr: { type: "button", "aria-label": t("settings.sort.disableAria") },
	});
	const disabledColumn = dualList.createDiv({ cls: "my-palette-sort-priorities__column" });
	disabledColumn.createDiv({
		cls: "my-palette-sort-priorities__label",
		text: t("settings.sort.disabled"),
	});
	const disabledList = disabledColumn.createDiv({
		cls: "my-palette-sort-priorities__list",
	});
	const dropIndicator = enabledList.createDiv({
		cls: "my-palette-sort-priorities__drop-indicator",
		attr: { "aria-hidden": "true" },
	});

	const commit = (): void => {
		void onChange();
	};

	const clearDropIndicator = (): void => {
		dropIndex = undefined;
		dropIndicator.removeClass("is-visible");
	};

	const showDropIndicator = (index: number): void => {
		dropIndex = Math.max(0, Math.min(index, priorities[state].length));
		const options = [
			...enabledList.querySelectorAll<HTMLButtonElement>(
				".my-palette-sort-priorities__option",
			),
		];
		const target = options[dropIndex];
		const last = options.at(-1);
		// 挿入位置の表示は、リストの流れに差し込まず、重ねて描く。ポインターの下でレイアウトが動くと、
		// dragleave が発火して、本来有効なドロップを捨ててしまうため。
		const indicatorTop = target
			? target.offsetTop
			: last
				? last.offsetTop + last.offsetHeight
				: enabledList.clientTop + 4;
		if (!dropIndicator.isConnected) enabledList.append(dropIndicator);
		dropIndicator.style.top = `${indicatorTop - 1}px`;
		dropIndicator.addClass("is-visible");
	};

	const dropDraggedOption = (): void => {
		if (draggedIndex === undefined || dropIndex === undefined) return;
		const current = priorities[state];
		const next = moveByInsertionIndex(current, draggedIndex, dropIndex);
		draggedIndex = undefined;
		clearDropIndicator();
		if (next === current) return;
		priorities[state] = [...next];
		render();
		commit();
	};

	const renderOption = (
		list: HTMLDivElement,
		priority: FileSortPriority,
		enabled: boolean,
		index: number,
	): void => {
		const selected = enabled ? selectedEnabled === priority : selectedDisabled === priority;
		const option = list.createEl("button", {
			cls: `my-palette-sort-priorities__option${selected ? " is-selected" : ""}`,
			text: sortPriorityLabel(priority),
			attr: {
				type: "button",
				role: "option",
				"aria-selected": String(selected),
			},
		});
		option.draggable = enabled;
		option.addEventListener("click", () => {
			if (enabled) {
				selectedEnabled = selected ? undefined : priority;
				selectedDisabled = undefined;
			} else {
				selectedDisabled = selected ? undefined : priority;
				selectedEnabled = undefined;
			}
			render();
		});
		if (!enabled) return;
		option.addEventListener("dragstart", (event) => {
			draggedIndex = index;
			dropIndex = index;
			option.addClass("is-dragging");
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData("text/plain", priority);
			}
			showDropIndicator(index);
		});
		option.addEventListener("dragend", () => {
			draggedIndex = undefined;
			option.removeClass("is-dragging");
			clearDropIndicator();
		});
	};

	const render = (): void => {
		const enabled = priorities[state];
		const enabledSet = new Set(enabled);
		const disabled = FILE_SORT_PRIORITY_OPTIONS.filter((priority) => !enabledSet.has(priority));
		enabledList.empty();
		disabledList.empty();
		enabled.forEach((priority, index) => renderOption(enabledList, priority, true, index));
		disabled.forEach((priority, index) => renderOption(disabledList, priority, false, index));
		if (draggedIndex !== undefined && dropIndex !== undefined) showDropIndicator(dropIndex);
		enableButton.disabled = selectedDisabled === undefined;
		disableButton.disabled = selectedEnabled === undefined;
	};

	enableButton.addEventListener("click", () => {
		if (selectedDisabled === undefined) return;
		priorities[state] = [...priorities[state], selectedDisabled];
		selectedDisabled = undefined;
		render();
		commit();
	});
	disableButton.addEventListener("click", () => {
		if (selectedEnabled === undefined) return;
		priorities[state] = priorities[state].filter((priority) => priority !== selectedEnabled);
		selectedEnabled = undefined;
		render();
		commit();
	});
	enabledList.addEventListener("dragover", (event) => {
		event.preventDefault();
		if (draggedIndex === undefined) return;
		if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		const options = [
			...enabledList.querySelectorAll<HTMLButtonElement>(
				".my-palette-sort-priorities__option",
			),
		];
		// 挿入先は、1つの安定したリストの座標系から決める。子要素のハンドラーは、ポインターが
		// 隙間の表示を横切ったときにドロップを取りこぼすことがあるため。
		const targetIndex = options.findIndex((option) => {
			const rect = option.getBoundingClientRect();
			return event.clientY < rect.top + rect.height / 2;
		});
		showDropIndicator(targetIndex === -1 ? options.length : targetIndex);
	});
	enabledList.addEventListener("drop", (event) => {
		event.preventDefault();
		event.stopPropagation();
		dropDraggedOption();
	});
	enabledList.addEventListener("dragleave", (event) => {
		const target = event.relatedTarget;
		if (!(target instanceof Node) || !enabledList.contains(target)) clearDropIndicator();
	});
	disabledList.addEventListener("dragover", () => clearDropIndicator());
	dropdown.onChange((value) => {
		state = value as FileSortState;
		selectedEnabled = undefined;
		selectedDisabled = undefined;
		render();
	});
	render();
}
