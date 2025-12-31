import NotionClient from "./NotionClient.js";
import NotionToMarkdown from "./NotionToMarkdown.js";
import { mkdir, writeFile } from "fs/promises";
import { join, normalize } from "path";

export interface PageInfo {
    id: string;
    title: string;
    parentId?: string;
}

export interface ExportOptions {
    outputDir: string;
    rootPageId: string;
}

/**
 * Notion 导出器 - 递归导出页面为 Markdown 文件
 */
export default class NotionExporter {
    private notionClient: NotionClient;
    private converter: NotionToMarkdown;

    constructor(apiKey: string) {
        this.notionClient = new NotionClient(apiKey);
        this.converter = new NotionToMarkdown(this.notionClient.getClient());
    }

    /**
     * 导出单个页面及其所有子页面
     * @param options - 导出选项
     */
    public async export(options: ExportOptions): Promise<void> {
        const { outputDir, rootPageId } = options;

        console.log(`开始导出页面: ${rootPageId}`);
        console.log(`输出目录: ${outputDir}\n`);

        await mkdir(outputDir, { recursive: true });
        await this.exportPageRecursive(rootPageId, outputDir);

        console.log("\n✅ 导出完成!");
    }

    /**
     * 递归导出页面
     * @param pageId - 页面 ID
     * @param currentDir - 当前输出目录
     * @param depth - 当前递归深度（用于日志缩进）
     */
    private async exportPageRecursive(
        pageId: string,
        currentDir: string,
        depth: number = 0
    ): Promise<void> {
        const indent = "  ".repeat(depth);

        try {
            // 获取页面信息
            const page = await this.notionClient.getPage(pageId);
            const title = this.notionClient.getPageTitle(page);
            const safeTitle = this.sanitizeFileName(title || "Untitled");

            console.log(`${indent}📄 导出: ${safeTitle}`);

            // 转换为 Markdown
            const markdown = await this.converter.pageToMarkdown(pageId);

            // 检查是否有内容
            if (markdown === undefined || markdown === null) {
                console.warn(`${indent}  ⚠️  页面内容为空,跳过写入文件`);
                // 仍然继续处理子页面
            } else {
                // 写入文件
                const filePath = join(currentDir, `${safeTitle}.md`);
                await writeFile(filePath, markdown, "utf-8");
            }

            // 获取子页面
            const childPages = await this.notionClient.getChildPages(pageId);

            if (childPages.length > 0) {
                console.log(`${indent}  └─ 发现 ${childPages.length} 个子页面`);

                // 创建子目录
                const subDir = join(currentDir, safeTitle);
                await mkdir(subDir, { recursive: true });

                // 递归导出子页面
                for (const childPage of childPages) {
                    await this.exportPageRecursive(childPage.id, subDir, depth + 1);
                }
            }
        } catch (error) {
            console.error(`${indent}❌ 导出失败 (${pageId}):`, error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * 清理文件名中的非法字符
     * @param fileName - 原始文件名
     * @returns 清理后的文件名
     */
    private sanitizeFileName(fileName: string): string {
        return fileName
            .replace(/[<>:"/\\|?*]/g, "_") // 替换非法字符
            .replace(/\s+/g, " ")          // 合并多个空格
            .trim()
            .substring(0, 200);            // 限制长度
    }
}
