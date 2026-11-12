/** コアのブックマークプラグインの木の1つのノード。パレットは編集のために参照を保つ。 */
export interface BookmarkEntry {
	type: string;
	title?: string;
	path?: string;
	query?: string;
	items?: BookmarkEntry[];
	ctime?: number;
}
