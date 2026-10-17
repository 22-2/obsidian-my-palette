/**
 * すべてのパレットとセレクターの絞り込みで共有する、Everything 風の検索構文。
 *
 * - 空白: AND
 * - `|`: OR。AND より強く結びつく(`a b|c` は `a <b|c>`)
 * - `!`: NOT。項の先頭にだけ付く(`hello!` はリテラルのまま)
 * - `<` `>`: グループ化
 * - `"..."`: 文字どおりの検索。あいまい一致ではなく、連続した部分文字列として一致させる
 *
 * 普通のクエリはこれらの演算子に触れず、入力の途中の文字列(`!`、`a |`、閉じていない `<` や `"`)は、
 * 失敗せずにそこまでで完成している部分として解析する。`path:` のような新しい構文は `readTerm` と
 * 項のノードに足し、論理構造とその評価器は変えないままにする。
 */

export interface QueryTerm {
	readonly kind: "term";
	readonly text: string;
	/** 一部でも引用されていれば true。その項は連続した部分文字列として一致する。 */
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
 * `>` は、項が終わりうる場所でだけグループを閉じる。将来、グループの中の `size:>10mb` が
 * 比較演算子を保てるように。
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
		// 以下のすべての分岐は、トークンの境界で動く。単語の途中の `!` と `<` をリテラルのままにするのは、
		// この性質による。
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
		// 空の引用符の組は、検索には何も寄与しない。
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
			// 前に何もない余分な演算子(項の前の `|`)で、ループが止まってはいけない。
			if (this.index === start) this.index++;
		}
		return combine("and", operands);
	}

	private parseOr(): QueryNode | undefined {
		const operands: QueryNode[] = [];
		const first = this.parseUnary();
		if (first) operands.push(first);
		for (;;) {
			// `|` の前後の空白は、Everything と同じく OR の一部。
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
				// 閉じていないグループは、単にクエリの終わりまで続く。
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
 * クエリを解析する。undefined は、検索できる内容がないこと。ファイルの一致は、候補ごとに
 * 同じクエリの複数の見え方を求めるので、直前の解析結果を再利用する。
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
 * 一致が満たすべき項を、代わりの AND の分岐として返す。順位付けと強調表示は、これを読むので、
 * 除外された項が結果の順位を上げたり、ラベルを光らせたりすることはない。
 */
export function positiveTermBranches(query: string): string[][] {
	const node = parseSearchQuery(query);
	if (!node) return [];
	return positiveBranchesOf(node)
		.filter((terms) => terms.length > 0)
		.map((terms) => terms.map(({ text }) => text));
}

/** 一致に寄与しうるすべての項。 */
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

/** クエリのすべての項。除外された項も含む。 */
export function allQueryTerms(query: string): string[] {
	const node = parseSearchQuery(query);
	return node ? collectTerms(node).map(({ text }) => text) : [];
}
