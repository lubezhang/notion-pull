import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LeafPageExport } from "./notion/directoryPlan";

/**
 * 将准备好的 Markdown 页面写入磁盘，必要时自动创建目录。
 *
 * @param rootPath 根目录绝对路径
 * @param pages 待写入的页面列表
 * @param dryRun 是否仅打印计划
 */
export async function writeMarkdownPages(rootPath: string, pages: LeafPageExport[], dryRun: boolean): Promise<void> {
    for (const page of pages) {
        const targetDir = page.relativeDir ? path.join(rootPath, page.relativeDir) : rootPath;
        const filePath = path.join(targetDir, page.fileName);
        if (dryRun) {
            console.info("Dry Run: 计划写入文件", filePath);
            continue;
        }
        await mkdir(targetDir, { recursive: true });
        await writeFile(filePath, page.content, "utf8");
        console.info("已写入文件", filePath);
    }
}
