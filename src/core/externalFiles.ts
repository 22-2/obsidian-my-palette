export function isMarkdownPath(absolutePath: string): boolean {
	return /\.md$/i.test(absolutePath);
}
