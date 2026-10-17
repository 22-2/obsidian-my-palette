/**
 * Everything-style search syntax shared by every palette and selector filter.
 *
 * - whitespace: AND
 * - `|`: OR, which binds tighter than AND (`a b|c` is `a <b|c>`)
 * - `!`: NOT, only at the start of a term (`hello!` stays literal)
 * - `<` `>`: grouping
 * - `"..."`: literal text, matched contiguously instead of fuzzily
 *
 * Plain queries never touch these operators, and half-typed input (`!`, `a |`,
 * an unclosed `<` or `"`) parses to whatever is complete so far instead of
 * failing. New syntax such as `path:` modifiers belongs in `readTerm` and the
 * term node, leaving the boolean structure and its evaluators unchanged.
 */

export interface QueryTerm {
	readonly kind: "term";
	readonly text: string;
	/** True when any part was quoted; the term then matches as a contiguous substring. */
	readonly exact: boolean;
}

export interface QueryNot {
	readonly kind: "not";
	readonly operand: QueryNode;
}

export interface QueryAnd {
	readonly kind: "and";
	readonly operands: readonly QueryNode[];
}

export interface QueryOr {
	readonly kind: "or";
	readonly operands: readonly QueryNode[];
}

export type QueryNode = QueryTerm | QueryNot | QueryAnd | QueryOr;

type Token =
	| { readonly type: "term"; readonly text: string; readonly exact: boolean }
	| { readonly type: "space" | "or" | "not" | "open" | "close" };

function isSpace(char: string): boolean {
	return /\s/.test(char);
}

/**
 * `>` closes a group only where a term could end, so a future `size:>10mb`
 * inside a group keeps its comparison operator.
 */
function isTermEnd(query: string, index: number): boolean {
	const next = query[index];
	return next === undefined || isSpace(next) || next === "|" || next === ">";
}

function readTerm(query: string, start: number, depth: number): { token: Token; end: number } {
	let text = "";
	let exact = false;
	let quoted = false;
	let index = start;
	while (index < query.length) {
		const char = query[index];
		if (char === '"') {
			quoted = !quoted;
			exact = true;
			index++;
			continue;
		}
		if (!quoted) {
			if (isSpace(char) || char === "|") break;
			if (char === ">" && depth > 0 && isTermEnd(query, index + 1)) break;
		}
		text += char;
		index++;
	}
	return { token: { type: "term", text, exact }, end: index };
}

function tokenize(query: string): Token[] {
	const tokens: Token[] = [];
	let depth = 0;
	let index = 0;
	while (index < query.length) {
		const char = query[index];
		if (isSpace(char)) {
			while (index < query.length && isSpace(query[index])) index++;
			tokens.push({ type: "space" });
			continue;
		}
		// Every branch below runs at a token boundary, which is what keeps `!` and
		// `<` literal in the middle of a word.
		if (char === "|" || char === "!" || char === "<" || (char === ">" && depth > 0)) {
			if (char === "<") depth++;
			if (char === ">") depth--;
			tokens.push({
				type: char === "|" ? "or" : char === "!" ? "not" : char === "<" ? "open" : "close",
			});
			index++;
			continue;
		}
		const { token, end } = readTerm(query, index, depth);
		// An empty pair of quotes contributes nothing to search.
		if (token.type === "term" && token.text) tokens.push(token);
		index = end;
	}
	return tokens;
}

function combine(kind: "and" | "or", operands: readonly QueryNode[]): QueryNode | undefined {
	const flat = operands.flatMap((operand) =>
		operand.kind === kind ? operand.operands : [operand],
	);
	if (flat.length <= 1) return flat[0];
	return { kind, operands: flat };
}

class Parser {
	private index = 0;

	constructor(private readonly tokens: readonly Token[]) {}

	parse(): QueryNode | undefined {
		return this.parseAnd(false);
	}

	private peek(): Token | undefined {
		return this.tokens[this.index];
	}

	private skipSpaces(): void {
		while (this.peek()?.type === "space") this.index++;
	}

	private parseAnd(inGroup: boolean): QueryNode | undefined {
		const operands: QueryNode[] = [];
		for (;;) {
			this.skipSpaces();
			const token = this.peek();
			if (token === undefined || (inGroup && token.type === "close")) break;
			const start = this.index;
			const operand = this.parseOr();
			if (operand) operands.push(operand);
			// A stray operator (`|` with nothing before it) must not stall the loop.
			if (this.index === start) this.index++;
		}
		return combine("and", operands);
	}

	private parseOr(): QueryNode | undefined {
		const operands: QueryNode[] = [];
		const first = this.parseUnary();
		if (first) operands.push(first);
		for (;;) {
			// Spaces around `|` are part of the OR, as in Everything.
			const beforeSpaces = this.index;
			this.skipSpaces();
			if (this.peek()?.type !== "or") {
				this.index = beforeSpaces;
				break;
			}
			this.index++;
			this.skipSpaces();
			const next = this.parseUnary();
			if (next) operands.push(next);
		}
		return combine("or", operands);
	}

	private parseUnary(): QueryNode | undefined {
		const token = this.peek();
		if (token === undefined) return undefined;
		switch (token.type) {
			case "not": {
				this.index++;
				const operand = this.parseUnary();
				return operand ? { kind: "not", operand } : undefined;
			}
			case "open": {
				this.index++;
				const inner = this.parseAnd(true);
				// An unclosed group simply runs to the end of the query.
				if (this.peek()?.type === "close") this.index++;
				return inner;
			}
			case "term":
				this.index++;
				return { kind: "term", text: token.text, exact: token.exact };
			default:
				return undefined;
		}
	}
}

let cachedQuery: string | undefined;
let cachedNode: QueryNode | undefined;

/**
 * Parse a query; undefined means it has no searchable content. File matching
 * asks for several views of the same query per candidate, so the last parse is
 * reused.
 */
export function parseSearchQuery(query: string): QueryNode | undefined {
	if (query !== cachedQuery) {
		cachedQuery = query;
		cachedNode = new Parser(tokenize(query)).parse();
	}
	return cachedNode;
}

function positiveBranchesOf(node: QueryNode): QueryTerm[][] {
	switch (node.kind) {
		case "term":
			return [[node]];
		case "not":
			return [[]];
		case "or":
			return node.operands.flatMap(positiveBranchesOf);
		case "and":
			return node.operands.reduce<QueryTerm[][]>(
				(branches, operand) =>
					positiveBranchesOf(operand).flatMap((suffix) =>
						branches.map((prefix) => [...prefix, ...suffix]),
					),
				[[]],
			);
	}
}

/**
 * The terms a match must satisfy, as alternative AND branches. Ranking and
 * highlighting read these so an excluded term can never raise a result or
 * light up in its label.
 */
export function positiveTermBranches(query: string): string[][] {
	const node = parseSearchQuery(query);
	if (!node) return [];
	return positiveBranchesOf(node)
		.filter((terms) => terms.length > 0)
		.map((terms) => terms.map(({ text }) => text));
}

/** Every term that can contribute to a match. */
export function positiveQueryTerms(query: string): string[] {
	return positiveTermBranches(query).flat();
}

function collectTerms(node: QueryNode): QueryTerm[] {
	switch (node.kind) {
		case "term":
			return [node];
		case "not":
			return collectTerms(node.operand);
		case "and":
		case "or":
			return node.operands.flatMap(collectTerms);
	}
}

/** Every term in the query, excluded ones included. */
export function allQueryTerms(query: string): string[] {
	const node = parseSearchQuery(query);
	return node ? collectTerms(node).map(({ text }) => text) : [];
}
