#!/usr/bin/env node
import { Command } from "commander";
import { runExport } from "./index";
import { loadConfig, ExportConfigInput } from "./config";

const program = new Command();

program
  .name("notion-pull")
  .description("Export Notion workspace content into local Markdown files")
  .option("-t, --token <token>", "Notion integration token (default: NOTION_TOKEN env)")
  .option("-r, --root <pageId>", "Root page ID to export")
  .option("-o, --out-dir <path>", "Output directory", "./export")
  .option("-c, --concurrency <number>", "Max concurrent page exports", parseInt)
  .option("--download-concurrency <number>", "Max concurrent asset downloads", parseInt)
  .option("--force", "Overwrite existing files", false)
  .option("--dry-run", "Print pages without writing files", false)
  .option("--proxy <url>", "HTTP/HTTPS 代理地址，用于访问 Notion API")
  .option("--config <path>", "Path to JSON config file")
  .showHelpAfterError();

async function main(): Promise<void> {
  const sanitizedArgv = sanitizeArgv(process.argv);
  program.parse(sanitizedArgv);
  const options = program.opts<ExportConfigInput>();

  const config = await loadConfig(options);
  await runExport(config);
}

main().catch((error) => {
  console.error("Export failed:", error);
  process.exitCode = 1;
});

function sanitizeArgv(argv: string[]): string[] {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex === -1) {
    return argv;
  }
  return [...argv.slice(0, separatorIndex), ...argv.slice(separatorIndex + 1)];
}
