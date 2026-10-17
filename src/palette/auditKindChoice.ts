import { AUDIT_KIND_ICONS, AUDIT_KIND_LABELS } from "src/audit/auditKinds";
import { AUDIT_KINDS, type AuditKind } from "src/audit/vaultAudit";
import type MyPalettePlugin from "src/main";
import type { PaletteMode } from "src/palette/results";
import { PanelChoice } from "src/ui/panelChoice";

/**
 * The kind Vault audit lists, chosen in the options menu. The kind is saved in the settings,
 * so every surface shows the same kind and the next one opens with it.
 */
export function createAuditKindChoice(
	plugin: MyPalettePlugin,
	onChange: () => void,
): PanelChoice<AuditKind> {
	return new PanelChoice<AuditKind>({
		id: "audit-kind",
		label: "Show",
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

/** The choice is shown only in Vault audit; another surface may have changed the kind. */
export function syncAuditKindChoice(
	choice: PanelChoice<AuditKind> | undefined,
	mode: PaletteMode,
	kind: AuditKind,
): void {
	choice?.setHidden(mode !== "audit");
	choice?.set(kind);
}
