import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "src/settings/model";
import { IntegrationAvailability, type ConnectionResult } from "src/app/integrationAvailability";

const success: ConnectionResult = { ok: true, message: "Connected" };
const failure: ConnectionResult = { ok: false, message: "Unavailable" };

describe("integration setup", () => {
	it("hides unchecked and failed connections and restores them after a successful test", async () => {
		const settings = structuredClone(DEFAULT_SETTINGS);
		const check = vi.fn().mockResolvedValueOnce(failure).mockResolvedValue(success);
		const availability = new IntegrationAvailability(
			() => settings,
			check,
			() => false,
		);
		expect(availability.current).toEqual({ everything: false, smartConnections: false });
		await availability.refresh();
		expect(availability.current.everything).toBe(false);
		await availability.refresh(true);
		expect(availability.current.everything).toBe(true);
		await availability.refresh();
		expect(check).toHaveBeenCalledTimes(2);
		availability.markEverythingUnavailable();
		expect(availability.current.everything).toBe(false);
	});

	it("ignores stale checks after the connection settings change", async () => {
		const settings = structuredClone(DEFAULT_SETTINGS);
		let finishOld!: (result: ConnectionResult) => void;
		const check = vi
			.fn()
			.mockImplementationOnce(
				() =>
					new Promise<ConnectionResult>((resolve) => {
						finishOld = resolve;
					}),
			)
			.mockResolvedValue(failure);
		const availability = new IntegrationAvailability(
			() => settings,
			check,
			() => false,
		);
		const oldCheck = availability.refresh();
		settings.everything.httpUrl = "http://127.0.0.1:50000/";
		await availability.refresh();
		finishOld(success);
		await oldCheck;
		expect(availability.current.everything).toBe(false);
		expect(check.mock.calls[0]?.[1].aborted).toBe(true);
	});

	it("shares a pending check and respects disabled integrations", async () => {
		const settings = structuredClone(DEFAULT_SETTINGS);
		let finish!: (result: ConnectionResult) => void;
		const check = vi.fn(
			() =>
				new Promise<ConnectionResult>((resolve) => {
					finish = resolve;
				}),
		);
		let ready = false;
		const availability = new IntegrationAvailability(
			() => settings,
			check,
			() => ready,
		);
		const first = availability.refresh();
		expect(availability.refresh()).toBe(first);
		finish(success);
		await first;
		ready = true;
		expect(availability.current.smartConnections).toBe(true);
		settings.integrations.everything.enabled = false;
		settings.integrations.smartConnections.enabled = false;
		await availability.refresh();
		expect(availability.current).toEqual({ everything: false, smartConnections: false });
		expect(check).toHaveBeenCalledTimes(1);
	});

	it("does not publish an unfinished check after disposal", async () => {
		let finish!: (result: ConnectionResult) => void;
		const availability = new IntegrationAvailability(
			() => DEFAULT_SETTINGS,
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
			() => false,
		);
		const notify = vi.fn();
		availability.subscribe(notify);
		const pending = availability.refresh();
		notify.mockClear();
		availability.dispose();
		finish(success);
		await pending;
		expect(notify).not.toHaveBeenCalled();
		expect(availability.current.everything).toBe(false);
	});
});
