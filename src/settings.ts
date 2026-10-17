/**
 * 設定モジュールの既存のパスを保つ。UI の実装は、純粋な設定の正規化のコードと並べて置く。
 */
export { DEFAULT_SETTINGS, type MyPaletteSettings } from "src/settings/model";
export { mergeSettings } from "src/settings/mergeSettings";
export { MyPaletteSettingTab } from "src/settings/settingTab";
