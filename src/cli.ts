#!/usr/bin/env node
import { Command } from "commander";
import { runExport } from "./index";
import { loadConfig, ExportConfigInput } from "./config";

const program = new Command();

program
    .name("notion-pull")
    .description("读取 Notion 页面结构并创建本地目录")
    .option("-t, --token <token>", "Notion 集成 Token，默认读取 NOTION_TOKEN")
    .option("-r, --root <pageId>", "根页面 ID，可在浏览器链接中获取")
    .option("-o, --out-dir <path>", "输出目录", "./export")
    .option("--max-depth <number>", "遍历子页面的最大层级，默认不限制", (value) => parseInt(value, 10))
    .option("--dry-run", "仅打印计划的目录而不创建", false)
    .option("--log-level <level>", "日志级别，可选 error|warn|info|debug", "info")
    .option("--config <path>", "JSON 配置文件路径")
    .showHelpAfterError();

/**
 * CLI 入口：解析参数并触发目录创建流程。
 */
async function main(): Promise<void> {
    const sanitizedArgv = sanitizeArgv(process.argv);
    program.parse(sanitizedArgv);
    const options = program.opts<ExportConfigInput>();

    const config = await loadConfig(options);
    await runExport(config);
}

main().catch((error) => {
    console.error("目录初始化失败:", error);
    process.exitCode = 1;
});

/**
 * Commander 将 "--" 之后的参数视作字面量，这里移除以保持行为简单。
 *
 * @param argv 原始命令行参数
 * @returns 移除 "--" 标记后的参数数组
 */
function sanitizeArgv(argv: string[]): string[] {
    const separatorIndex = argv.indexOf("--");
    if (separatorIndex === -1) {
        return argv;
    }
    return [...argv.slice(0, separatorIndex), ...argv.slice(separatorIndex + 1)];
}
