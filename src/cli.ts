#!/usr/bin/env node
import { Command } from "commander";
import { config } from "dotenv";
import NotionExporter from "./NotionExporter.js";

config();

const program = new Command();

program
    .name("notion-pull")
    .description("CLI to export Notion pages to Markdown format")
    .version("1.0.0");

// Export command
program
    .command("export")
    .description("Export Notion page and all its subpages to Markdown files")
    .argument("[pageId]", "Notion page ID (reads from NOTION_PAGE_ID env var if not provided)")
    .option("-o, --output <dir>", "Output directory", "./notion-export")
    .option("--no-download-media", "Do not download images and files locally (downloads by default)")
    .option("-a, --attachments-dir <name>", "Attachments directory name", "attachments")
    .action(async (pageId, options) => {
        const id = pageId || process.env.NOTION_PAGE_ID;
        const apiKey = process.env.NOTION_API_KEY;

        if (!id) {
            console.error("❌ Error: Missing page ID. Provide it as an argument or set NOTION_PAGE_ID in .env file");
            process.exit(1);
        }

        if (!apiKey) {
            console.error("❌ Error: Missing API key. Set NOTION_API_KEY in .env file");
            process.exit(1);
        }

        try {
            const exporter = new NotionExporter(apiKey);
            await exporter.export({
                rootPageId: id,
                outputDir: options.output,
                downloadMedia: options.downloadMedia,
                attachmentsDir: options.attachmentsDir,
            });
        } catch (error) {
            console.error("❌ Export failed:", error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

program.parse();

