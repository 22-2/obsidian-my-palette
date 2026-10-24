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

describe("ファイルリストの更新", () => {
	it("イベントを 1 回だけ登録します", () => {
		const f = fixture();
		f.subject.register();
		f.subject.register();
		expect(f.registerEvent).toHaveBeenCalledTimes(10);
	});

	it("バースト変更を 1 回の更新でデバウンスします", () => {
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

	it("非アクティブな場合はスケジュールをスキップし、キャンセルをサポートします", () => {
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

	it("非表示の間待機し、再度表示されるときに一度検索します", () => {
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
