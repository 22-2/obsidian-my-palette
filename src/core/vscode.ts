declare const electron: {
	shell: { openExternal: (url: string) => Promise<void> };
};

export async function openPathInCode(absolutePath: string): Promise<string | null> {
	try {
		await electron.shell.openExternal(`vscode://file/${absolutePath.replace(/\\/g, "/")}`);
		return null;
	} catch {
		return "Could not open the file in VS Code.";
	}
}
