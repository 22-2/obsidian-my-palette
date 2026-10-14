import { mergeCoverageReports } from "obsidian-e2e-toolkit/coverage";

await mergeCoverageReports({
	inputFiles: ["coverage/unit/coverage-final.json", "coverage/e2e/coverage-final.json"],
	outputDir: "coverage/combined",
});
