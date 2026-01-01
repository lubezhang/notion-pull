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

// 导出命令
program
    .command("export")
    .description("导出 Notion 页面及其所有子页面为 Markdown 文件")
    .argument("[pageId]", "Notion 页面 ID（如果不提供，将从环境变量 NOTION_PAGE_ID 读取）")
    .option("-o, --output <dir>", "输出目录", "./notion-export")
    .option("-d, --download-media", "下载图片和文件到本地（默认：true）", true)
    .option("-a, --attachments-dir <name>", "附件目录名称（默认：attachments）", "attachments")
    .action(async (pageId, options) => {
        const id = pageId || process.env.NOTION_PAGE_ID;
        const apiKey = process.env.NOTION_API_KEY;

        if (!id) {
            console.error("❌ 错误: 缺少页面 ID。请作为参数提供或在 .env 文件中设置 NOTION_PAGE_ID");
            process.exit(1);
        }

        if (!apiKey) {
            console.error("❌ 错误: 缺少 API 密钥。请在 .env 文件中设置 NOTION_API_KEY");
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
            console.error("❌ 导出失败:", error instanceof Error ? error.message : String(error));
            process.exit(1);
        }
    });

program.parse();

