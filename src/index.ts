import { ExportConfig } from "./config";
import { createRootDirectory, ensureChildDirectories, RootDirectoryCreation } from "./directory";
import { buildNotionDirectoryPlan } from "./notion/directoryPlan";
import { writeMarkdownPages } from "./writer";
import { createLogger } from "./logger";

/**
 * 目录创建入口：读取 Notion 页面结构并在本地创建对应的目录层级。
 *
 * @param config 标准化后的运行配置
 */
export async function runExport(config: ExportConfig): Promise<void> {
    const baseLogger = createLogger({ level: config.logLevel, module: "notion-pull" });
    const pipelineLogger = baseLogger.child("pipeline");
    const notionLogger = baseLogger.child("notion");
    const directoryLogger = baseLogger.child("directory");
    const writerLogger = baseLogger.child("writer");
    pipelineLogger.info("开始执行 Notion 导出计划", {
        rootPageId: config.rootPageId,
        outDir: config.outDir,
        dryRun: config.dryRun,
        maxDepth: config.maxDepth ?? "unlimited",
    });

    let rootPath: string | undefined;
    let rootCreation: RootDirectoryCreation | undefined;
    let processedPages = 0;

    const plan = await buildNotionDirectoryPlan({
        token: config.token,
        rootPageId: config.rootPageId,
        maxDepth: config.maxDepth,
        logger: notionLogger,
        onRootResolved: async (rootDirectoryName) => {
            const creation = await createRootDirectory(
                { outDir: config.outDir, dryRun: config.dryRun },
                rootDirectoryName,
                directoryLogger,
            );
            rootPath = creation.rootPath;
            rootCreation = creation;
        },
        onLeafPage: async (page) => {
            if (!rootPath) {
                throw new Error("Root directory not initialized");
            }
            await writeMarkdownPages(rootPath, [page], config.dryRun, writerLogger);
            processedPages += 1;
        },
    });

    if (!rootPath || !rootCreation) {
        throw new Error("根目录尚未创建，无法继续导出");
    }

    const childResults = await ensureChildDirectories(
        rootPath,
        plan.childDirectories,
        config.dryRun,
        directoryLogger,
    );
    const allDirectoryResults = [rootCreation.result, ...childResults];

    const remainingPages = plan.leafPages.length;
    if (remainingPages > 0) {
        await writeMarkdownPages(rootPath, plan.leafPages, config.dryRun, writerLogger);
        processedPages += remainingPages;
    }

    pipelineLogger.info("导出流程完成", {
        rootPath,
        totalDirectories: allDirectoryResults.length,
        totalPages: processedPages,
    });
}
