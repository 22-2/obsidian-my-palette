import { DropdownComponent, type Setting } from "obsidian";
import {
	FILE_SORT_PRIORITY_OPTIONS,
	type FileSortPriorities,
	type FileSortPriority,
	type FileSortState,
} from "src/model/settings";

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
		dropIndicator.remove();
	};

	const showDropIndicator = (index: number): void => {
		dropIndex = Math.max(0, Math.min(index, priorities[state].length));
		const options = [
			...enabledList.querySelectorAll<HTMLButtonElement>(
				".my-palette-sort-priorities__option",
			),
		];
		const target = options[dropIndex];
		if (target) enabledList.insertBefore(dropIndicator, target);
		else enabledList.append(dropIndicator);
		dropIndicator.addClass("is-visible");
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
			if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
			showDropIndicator(index);
		});
		option.addEventListener("dragend", () => {
			draggedIndex = undefined;
			option.removeClass("is-dragging");
			clearDropIndicator();
		});
		option.addEventListener("dragover", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
			const rect = option.getBoundingClientRect();
			showDropIndicator(index + (event.clientY > rect.top + rect.height / 2 ? 1 : 0));
		});
		option.addEventListener("drop", (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (draggedIndex === undefined || dropIndex === undefined) return;
			const sourceIndex = draggedIndex;
			const insertionIndex = dropIndex;
			if (insertionIndex === sourceIndex || insertionIndex === sourceIndex + 1) {
				draggedIndex = undefined;
				clearDropIndicator();
				return;
			}
			const next = [...priorities[state]];
			const [moved] = next.splice(sourceIndex, 1);
			if (moved === undefined) return;
			// The target index is measured before removing the source item, so a
			// downward move needs one slot subtracted before insertion.
			next.splice(
				insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex,
				0,
				moved,
			);
			priorities[state] = next;
			draggedIndex = undefined;
			clearDropIndicator();
			render();
			commit();
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
	enabledList.addEventListener("dragover", (event) => event.preventDefault());
	enabledList.addEventListener("drop", (event) => {
		event.preventDefault();
		if (draggedIndex === undefined || event.target !== enabledList) return;
		const next = [...priorities[state]];
		const [moved] = next.splice(draggedIndex, 1);
		if (moved === undefined) return;
		next.push(moved);
		priorities[state] = next;
		draggedIndex = undefined;
		clearDropIndicator();
		render();
		commit();
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
