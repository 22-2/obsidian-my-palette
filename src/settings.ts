/**
 * Keep the historical settings module path stable while the UI implementation
 * lives beside the pure settings normalization code.
 */
export { DEFAULT_SETTINGS, type MyPaletteSettings } from "src/model/settings";
export { mergeSettings } from "src/settings/mergeSettings";
export { MyPaletteSettingTab } from "src/settings/settingTab";
