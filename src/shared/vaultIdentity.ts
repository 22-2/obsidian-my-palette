import { getVaultBasePath } from "src/platform/obsidianInternals";

interface VaultIdentityApp {
	vault: {
		adapter: object;
		getName: () => string;
	};
}

export function getVaultId(app: VaultIdentityApp): string {
	const source = getVaultBasePath(app.vault) ?? app.vault.getName();
	// 安定したハッシュを使うことで、絶対パスをブラウザの保存領域に残さずに済む。
	// 同じ名前のノートを含む 2 つの保管庫も区別できるようにするため。
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
