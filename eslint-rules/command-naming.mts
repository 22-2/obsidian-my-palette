import type { Rule } from "eslint";
import type { ObjectExpression, Property } from "estree";

// Commands are named "Open <thing>" and their id is that name in kebab case, so the
// command list, the hotkey settings and the e2e tests all read the same
// (docs/GLOSSARY.md).
const NAME_PREFIX = "Open ";

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
			name: 'Command name "{{name}}" must start with "Open " (docs/GLOSSARY.md).',
			id: 'Command id "{{id}}" must be "{{expected}}", the kebab case of its name.',
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
				const nameText = stringValue(name);
				if (!nameText.startsWith(NAME_PREFIX)) {
					context.report({ node: name, messageId: "name", data: { name: nameText } });
					return;
				}
				const expected = nameText.toLowerCase().replace(/\s+/g, "-");
				const idText = stringValue(id);
				if (idText !== expected)
					context.report({ node: id, messageId: "id", data: { id: idText, expected } });
			},
		};
	},
};

export default { rules: { "command-naming": commandNaming } };
