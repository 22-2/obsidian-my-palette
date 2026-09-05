interface VaultIdentityApp {
	vault: {
		adapter: object;
		getName: () => string;
	};
}

export function getVaultId(app: VaultIdentityApp): string {
	const adapter = app.vault.adapter as {
		getBasePath?: () => string;
	};
	const source = adapter.getBasePath?.() ?? app.vault.getName();
	// A stable hash keeps the absolute Vault path out of browser storage while
	// still separating two Vaults that happen to contain identically named notes.
	let hash = 2166136261;
	for (const character of source) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return `v${(hash >>> 0).toString(16)}`;
}

export function getVaultPathKey(vaultId: string, path: string): string {
	return `${vaultId}\u0000${path}`;
}
