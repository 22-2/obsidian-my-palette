import { DropdownComponent, type Setting } from "obsidian";
import {
	FILE_SORT_PRIORITY_OPTIONS,
	type FileSortPriorities,
	type FileSortPriority,
	type FileSortState,
} from "src/settings/model";
import { moveByInsertionIndex } from "src/settings/fileSortPriorityOrdering";

const STATE_LABELS: Record<FileSortState, string> = {
	blank: "On blank",
	input: "On input",
};

/**
 * Render the Office-style dual list separately from Obsidian's ordinary
 * controls because ordering, enablement, and query state form one atomic value.
 */
export function renderFileSortPriorityControl(
	setting: Setting,
	priorities: FileSortPriorities,
	onChange: () => Promise<void>,
): void {
	setting.settingEl.addClass("my-palette-sort-priorities-setting");
	const control = setting.controlEl;
	const stateRow = control.createDiv({ cls: "my-palette-sort-priorities__state" });
	stateRow.createSpan({ text: "Apply when" });
	let state: FileSortState = "blank";
	let selectedEnabled: FileSortPriority | undefined;
	let selectedDisabled: FileSortPriority | undefined;
	let draggedIndex: number | undefined;
	let dropIndex: number | undefined;

	const dropdown = new DropdownComponent(stateRow);
	for (const [value, label] of Object.entries(STATE_LABELS)) dropdown.addOption(value, label);

	const dualList = control.createDiv({ cls: "my-palette-sort-priorities__dual-list" });
	const enabledColumn = dualList.createDiv({ cls: "my-palette-sort-priorities__column" });
	enabledColumn.createDiv({ cls: "my-palette-sort-priorities__label", text: "Enabled" });
	const enabledList = enabledColumn.createDiv({
		cls: "my-palette-sort-priorities__list",
	});
	const transferButtons = dualList.createDiv({ cls: "my-palette-sort-priorities__buttons" });
	const enableButton = transferButtons.createEl("button", {
		text: "←",
		attr: { type: "button", "aria-label": "Enable selected sort priority" },
	});
	const disableButton = transferButtons.createEl("button", {
		text: "→",
		attr: { type: "button", "aria-label": "Disable selected sort priority" },
	});
	const disabledColumn = dualList.createDiv({ cls: "my-palette-sort-priorities__column" });
	disabledColumn.createDiv({ cls: "my-palette-sort-priorities__label", text: "Disabled" });
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
		// Overlay the indicator instead of inserting it into the list flow. Moving
		// layout under the pointer can emit dragleave and discard an otherwise valid drop.
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
			text: priority,
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
		// Resolve the destination from one stable list coordinate space. Child-level
		// handlers could miss a drop when the pointer crossed the gap indicator.
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
