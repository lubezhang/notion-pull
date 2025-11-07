import { ExportConfig } from "./config";
import { createRootDirectory, ensureChildDirectories } from "./directory";
import { buildNotionDirectoryPlan } from "./notion/directoryPlan";
import { writeMarkdownPages } from "./writer";

/**
 * 目录创建入口：读取 Notion 页面结构并在本地创建对应的目录层级。
 *
 * @param config 标准化后的运行配置
 */
export async function runExport(config: ExportConfig): Promise<void> {
    const plan = await buildNotionDirectoryPlan({
        token: config.token,
        rootPageId: config.rootPageId,
        maxDepth: config.maxDepth,
    });

    const { rootPath, result: rootResult } = await createRootDirectory(
        { outDir: config.outDir, dryRun: config.dryRun },
        plan.rootDirectoryName,
    );

    const childResults = await ensureChildDirectories(rootPath, plan.childDirectories, config.dryRun);
    const results = [rootResult, ...childResults];

    const message = config.dryRun ? "Dry Run: 即将创建的目录" : "已创建目录";
    for (const result of results) {
        console.info(
            message,
            result.relativePath === "." ? result.absolutePath : `${result.relativePath} -> ${result.absolutePath}`,
        );
    }

    await writeMarkdownPages(rootPath, plan.leafPages, config.dryRun);
}
