import { AUDIT_KIND_ICONS, AUDIT_KIND_LABELS } from "src/audit/auditKinds";
import { AUDIT_KINDS, type AuditKind } from "src/audit/vaultAudit";
import type MyPalettePlugin from "src/main";
import type { PaletteMode } from "src/palette/results";
import { PanelChoice } from "src/ui/panelChoice";
import { t } from "src/i18n";

/**
 * Vault 監査が一覧にする種類。オプションのメニューで選ぶ。種類は設定に保存するので、
 * どの画面も同じ種類を表示し、次に開いたときもその種類で始まる。
 */
export function createAuditKindChoice(
	plugin: MyPalettePlugin,
	onChange: () => void,
): PanelChoice<AuditKind> {
	return new PanelChoice<AuditKind>({
		id: "audit-kind",
		label: t("audit.kindChoice.label"),
		items: AUDIT_KINDS.map((kind) => ({
			value: kind,
			label: AUDIT_KIND_LABELS[kind],
			icon: AUDIT_KIND_ICONS[kind],
		})),
		value: plugin.settings.audit.kind,
		onChange: (kind) => {
			plugin.settings.audit.kind = kind;
			onChange();
			void plugin.saveSettings();
		},
	});
}

/** この選択肢は Vault 監査でだけ表示する。ほかの画面が種類を変えているかもしれないため。 */
export function syncAuditKindChoice(
	choice: PanelChoice<AuditKind> | undefined,
	mode: PaletteMode,
	kind: AuditKind,
): void {
	choice?.setHidden(mode !== "audit");
	choice?.set(kind);
}
