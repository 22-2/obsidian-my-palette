import type { App, EventRef } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileListRefresh } from "src/palette/surfaces/fileListRefresh";

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

function fixture(active = true, visible = true) {
	vi.useFakeTimers();
	vi.stubGlobal("window", globalThis);
	const handlers: Array<() => void> = [];
	const workspaceHandlers: Array<() => void> = [];
	const on = (_name: string, handler: () => void) => {
		handlers.push(handler);
		return {} as EventRef;
	};
	const onWorkspace = (_name: string, handler: () => void) => {
		workspaceHandlers.push(handler);
		return {} as EventRef;
	};
	const app = {
		vault: { on },
		metadataCache: { on },
		workspace: { on: onWorkspace },
	} as unknown as App;
	const registerEvent = vi.fn();
	const refresh = vi.fn();
	const state = { active, visible };
	const subject = new FileListRefresh(
		app,
		registerEvent,
		() => state.active,
		() => state.visible,
		refresh,
	);
	return { subject, handlers, workspaceHandlers, registerEvent, refresh, state };
}

describe("file list refresh", () => {
	it("registers its events only once", () => {
		const f = fixture();
		f.subject.register();
		f.subject.register();
		expect(f.registerEvent).toHaveBeenCalledTimes(10);
	});

	it("debounces bursts of changes into one refresh", () => {
		const f = fixture();
		f.subject.register();
		f.handlers[0]?.();
		vi.advanceTimersByTime(300);
		f.handlers[1]?.();
		vi.advanceTimersByTime(399);
		expect(f.refresh).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(f.refresh).toHaveBeenCalledTimes(1);
	});

	it("skips scheduling when inactive and supports cancel", () => {
		const f = fixture(false);
		f.subject.register();
		f.handlers[0]?.();
		vi.advanceTimersByTime(1000);
		expect(f.refresh).not.toHaveBeenCalled();

		f.state.active = true;
		f.handlers[0]?.();
		f.subject.cancel();
		vi.advanceTimersByTime(1000);
		expect(f.refresh).not.toHaveBeenCalled();
	});

	it("waits while hidden and searches once when shown again", () => {
		const f = fixture(true, false);
		f.subject.register();
		f.handlers[0]?.();
		f.handlers[1]?.();
		vi.advanceTimersByTime(1000);
		expect(f.refresh).not.toHaveBeenCalled();

		f.state.visible = true;
		f.workspaceHandlers[0]?.();
		f.workspaceHandlers[1]?.();
		vi.advanceTimersByTime(400);
		expect(f.refresh).toHaveBeenCalledTimes(1);

		f.workspaceHandlers[0]?.();
		vi.advanceTimersByTime(1000);
		expect(f.refresh).toHaveBeenCalledTimes(1);
	});
});
