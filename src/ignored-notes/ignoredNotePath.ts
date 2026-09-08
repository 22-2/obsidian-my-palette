export function ignoredNotePathParts(path: string): {
	basename: string;
	extension: string;
} {
	const name = path.slice(path.lastIndexOf("/") + 1);
	const extensionIndex = name.lastIndexOf(".");
	return {
		basename: extensionIndex > 0 ? name.slice(0, extensionIndex) : name,
		extension: extensionIndex > 0 ? name.slice(extensionIndex + 1).toLocaleLowerCase() : "",
	};
}
