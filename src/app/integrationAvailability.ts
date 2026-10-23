import type { IntegrationSettings, MyPaletteSettings } from "src/settings/model";
import { t } from "src/i18n";

export type IntegrationReadiness = Record<keyof IntegrationSettings, boolean>;
export interface ConnectionResult {
	ok: boolean;
	message: string;
}

function connectionKey(settings: MyPaletteSettings["everything"]): string {
	return JSON.stringify([
		settings.backend,
		settings.esPath,
		settings.httpUrl,
		settings.username,
		settings.password,
		settings.requestTimeoutMs,
	]);
}

/** Home を塞がずに外部連携の準備状態を確認し、古い設定への確認結果は捨てる。 */
export class IntegrationAvailability {
	private result: ConnectionResult = {
		ok: false,
		message: t("integration.notChecked"),
	};
	private verifiedKey?: string;
	private checkedAt = 0;
	private pending?: { key: string; promise: Promise<ConnectionResult> };
	private controller?: AbortController;
	private generation = 0;
	private disposed = false;
	private readonly listeners = new Set<() => void>();
	private lastPublished = "";

	constructor(
		private readonly settings: () => MyPaletteSettings,
		private readonly checkEverything: (
			settings: MyPaletteSettings["everything"],
			signal: AbortSignal,
		) => Promise<ConnectionResult>,
		private readonly smartReady: () => boolean,
	) {}

	get current(): IntegrationReadiness {
		const settings = this.settings();
		return {
			everything:
				settings.integrations.everything.enabled &&
				this.verifiedKey === connectionKey(settings.everything) &&
				this.result.ok,
			smartConnections: settings.integrations.smartConnections.enabled && this.smartReady(),
		};
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	refresh(force = false): Promise<ConnectionResult> {
		if (this.disposed) return Promise.resolve(this.result);
		this.publish();
		const settings = this.settings();
		const snapshot = { ...settings.everything };
		const key = connectionKey(snapshot);
		if (!force && !settings.integrations.everything.enabled)
			return Promise.resolve(this.result);
		if (this.pending?.key === key) return this.pending.promise;
		if (
			!force &&
			key === this.verifiedKey &&
			this.result.ok &&
			Date.now() - this.checkedAt < 30_000
		)
			return Promise.resolve(this.result);
		this.controller?.abort();
		const generation = ++this.generation;
		const controller = new AbortController();
		this.controller = controller;
		const promise = this.checkEverything(snapshot, controller.signal).then((result) => {
			if (this.disposed || generation !== this.generation) return result;
			this.verifiedKey = key;
			this.result = result;
			this.checkedAt = Date.now();
			this.pending = undefined;
			this.publish();
			return result;
		});
		this.pending = { key, promise };
		return promise;
	}

	markEverythingUnavailable(): void {
		this.generation++;
		this.controller?.abort();
		this.pending = undefined;
		this.result = {
			ok: false,
			message: t("integration.searchFailed"),
		};
		this.publish();
	}

	dispose(): void {
		this.disposed = true;
		this.generation++;
		this.controller?.abort();
		this.listeners.clear();
	}

	private publish(): void {
		const key = JSON.stringify(this.current);
		if (key === this.lastPublished) return;
		this.lastPublished = key;
		for (const listener of this.listeners) listener();
	}
}
