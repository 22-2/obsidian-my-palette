import { describe, expect, it } from "vitest";
import { buildEverythingQuery } from "./everythingQuery";

describe("buildEverythingQuery", () => {
	it("limits Vault searches by root and extension", () => {
		expect(buildEverythingQuery("E:\\Vault", "vault", ["md", "canvas"], "note")).toBe(
			'path:"E:\\Vault" ext:md;canvas note',
		);
	});

	it("keeps directory searches within the Vault while allowing every extension", () => {
		expect(buildEverythingQuery("E:\\Vault", "directory", ["md"], "outside.md")).toBe(
			'path:"E:\\Vault" outside.md',
		);
	});
});
