import type { Rule } from "eslint";
import type { ObjectExpression, Property } from "estree";

// コマンドの id は英語のケバブケースで固定する。id はホットキー設定や保存データに残るため、
// 表示名(日本語)を変えても id を変えない。
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function literalProperty(object: ObjectExpression, key: string): Property | undefined {
	return object.properties.find(
		(candidate): candidate is Property =>
			candidate.type === "Property" &&
			!candidate.computed &&
			candidate.key.type === "Identifier" &&
			candidate.key.name === key &&
			candidate.value.type === "Literal" &&
			typeof candidate.value.value === "string",
	);
}

function stringValue(property: Property): string {
	return property.value.type === "Literal" ? String(property.value.value) : "";
}

const commandNaming: Rule.RuleModule = {
	meta: {
		type: "problem",
		schema: [],
		messages: {
			name: "コマンドの表示名 {{name}} が空です。",
			id: 'コマンドの id "{{id}}" は英語の小文字とハイフンだけにしてください(例: "open-home")。',
		},
	},
	create(context) {
		return {
			CallExpression(node) {
				const { callee } = node;
				const isAddCommand =
					callee.type === "MemberExpression" &&
					callee.property.type === "Identifier" &&
					callee.property.name === "addCommand";
				const [definition] = node.arguments;
				if (!isAddCommand || definition?.type !== "ObjectExpression") return;
				const name = literalProperty(definition, "name");
				const id = literalProperty(definition, "id");
				if (!name || !id) return;
				if (stringValue(name).trim() === "") {
					context.report({ node: name, messageId: "name", data: { name: "" } });
					return;
				}
				const idText = stringValue(id);
				if (!ID_PATTERN.test(idText))
					context.report({ node: id, messageId: "id", data: { id: idText } });
			},
		};
	},
};

export default { rules: { "command-naming": commandNaming } };
