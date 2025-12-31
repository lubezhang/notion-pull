import NotionClient, { propertiesToMarkdown, databaseToMarkdownTable } from "./NotionClient.js";
import NotionToMarkdown from "./NotionToMarkdown.js";
import FileDownloader from "./FileDownloader.js";
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
    downloadMedia?: boolean; // 是否下载图片和文件
    attachmentsDir?: string; // 附件目录名称
}

/**
 * Notion 导出器 - 递归导出页面为 Markdown 文件
 */
export default class NotionExporter {
    private notionClient: NotionClient;
    private converter: NotionToMarkdown;
    private fileDownloader: FileDownloader;

    constructor(apiKey: string) {
        this.notionClient = new NotionClient(apiKey);
        this.converter = new NotionToMarkdown(this.notionClient.getClient());
        this.fileDownloader = new FileDownloader();
    }

    /**
     * 导出单个页面及其所有子页面
     * @param options - 导出选项
     */
    public async export(options: ExportOptions): Promise<void> {
        const { outputDir, rootPageId, downloadMedia = false, attachmentsDir = "attachments" } = options;

        console.log(`开始导出页面: ${rootPageId}`);
        console.log(`输出目录: ${outputDir}`);
        if (downloadMedia) {
            console.log(`将下载图片和文件到: ${attachmentsDir}/`);
        }
        console.log();

        await mkdir(outputDir, { recursive: true });
        await this.exportPageRecursive(rootPageId, outputDir, downloadMedia, attachmentsDir);

        console.log("\n✅ 导出完成!");

        if (downloadMedia) {
            const totalFiles = this.fileDownloader.getDownloadedFiles().size;
            console.log(`📦 共下载 ${totalFiles} 个文件`);
        }
    }

    /**
     * 递归导出页面
     * @param pageId - 页面 ID
     * @param currentDir - 当前输出目录
     * @param downloadMedia - 是否下载图片和文件
     * @param attachmentsDir - 附件目录名称
     * @param depth - 当前递归深度（用于日志缩进）
     */
    private async exportPageRecursive(
        pageId: string,
        currentDir: string,
        downloadMedia: boolean = false,
        attachmentsDir: string = "attachments",
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
            let markdown = await this.converter.pageToMarkdown(pageId);

            // 如果内容为空,尝试从页面属性中生成内容
            if (!markdown || markdown.trim() === "") {
                const propertiesMarkdown = propertiesToMarkdown(page);
                if (propertiesMarkdown) {
                    console.log(`${indent}  ℹ️  页面内容块为空,导出页面属性`);
                    markdown = propertiesMarkdown;
                }
            }

            // 检查是否有内容
            if (markdown === undefined || markdown === null || markdown.trim() === "") {
                console.warn(`${indent}  ⚠️  页面内容为空,跳过写入文件`);
                // 仍然继续处理子页面
            } else {
                // 如果启用了文件下载
                if (downloadMedia && markdown) {
                    // 提取所有图片和文件链接
                    const mediaLinks = this.converter.extractMediaLinks(markdown);

                    if (mediaLinks.length > 0) {
                        console.log(`${indent}  📥 发现 ${mediaLinks.length} 个媒体文件`);
                        const urlMapping = new Map<string, string>();

                        // 下载所有文件
                        for (const media of mediaLinks) {
                            try {
                                const downloaded = await this.fileDownloader.downloadFile(
                                    media.url,
                                    currentDir,
                                    attachmentsDir
                                );

                                // 记录 URL 映射
                                urlMapping.set(media.url, downloaded.relativePath);
                                console.log(`${indent}     ✓ ${media.type === "image" ? "图片" : "文件"}: ${media.altText || downloaded.relativePath}`);
                            } catch (error) {
                                console.error(`${indent}     ✗ 下载失败: ${media.url}`);
                            }
                        }

                        // 替换 Markdown 中的 URL
                        markdown = this.converter.replaceMediaUrls(markdown, urlMapping);
                    }
                }

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
                    // 根据类型区分处理页面和数据库
                    if (childPage.type === "database") {
                        await this.exportDatabaseRecursive(childPage.id, subDir, downloadMedia, attachmentsDir, depth + 1);
                    } else {
                        await this.exportPageRecursive(childPage.id, subDir, downloadMedia, attachmentsDir, depth + 1);
                    }
                }
            }
        } catch (error) {
            console.error(`${indent}❌ 导出失败 (${pageId}):`, error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * 递归导出数据库(导出为 Markdown 表格)
     * @param databaseId - 数据库 ID
     * @param currentDir - 当前输出目录
     * @param downloadMedia - 是否下载图片和文件
     * @param attachmentsDir - 附件目录名称
     * @param depth - 当前递归深度(用于日志缩进)
     */
    private async exportDatabaseRecursive(
        databaseId: string,
        currentDir: string,
        downloadMedia: boolean = false,
        attachmentsDir: string = "attachments",
        depth: number = 0
    ): Promise<void> {
        const indent = "  ".repeat(depth);

        try {
            // 获取数据库信息
            const database = await this.notionClient.getPageOrDatabase(databaseId, "database");
            const title = this.notionClient.getPageTitle(database);
            const safeTitle = this.sanitizeFileName(title || "Untitled Database");

            console.log(`${indent}🗄️  导出数据库: ${safeTitle}`);

            // 查询数据库中的所有页面
            const pages = await this.notionClient.getClient().request<{ results: any[] }>({
                path: `databases/${databaseId}/query`,
                method: "post",
            });

            if (pages.results && pages.results.length > 0) {
                console.log(`${indent}  └─ 发现 ${pages.results.length} 个数据库条目,导出为表格`);

                // 将数据库转换为 Markdown 表格
                const tableMarkdown = databaseToMarkdownTable(pages.results, safeTitle);

                // 写入表格文件
                const filePath = join(currentDir, `${safeTitle}.md`);
                await writeFile(filePath, tableMarkdown, "utf-8");

                // 导出每个数据库条目的详细页面内容(如果有内容块或子页面)
                const detailsDir = join(currentDir, `${safeTitle}_详情`);
                let hasDetails = false;

                for (const page of pages.results) {
                    if ("id" in page) {
                        // 检查页面是否有内容块或子页面
                        const pageBlocks = await this.notionClient.getClient().blocks.children.list({
                            block_id: page.id,
                        });

                        const childPages = await this.notionClient.getChildPages(page.id);

                        // 只有当页面有内容块或子页面时才创建详情目录并导出
                        if (pageBlocks.results.length > 0 || childPages.length > 0) {
                            if (!hasDetails) {
                                await mkdir(detailsDir, { recursive: true });
                                hasDetails = true;
                            }
                            await this.exportPageRecursive(page.id, detailsDir, downloadMedia, attachmentsDir, depth + 1);
                        }
                    }
                }

                if (hasDetails) {
                    console.log(`${indent}  └─ 详细内容已导出到: ${safeTitle}_详情/`);
                }
            } else {
                console.log(`${indent}  └─ 数据库为空`);

                // 即使数据库为空,也创建一个文件
                const emptyTableMarkdown = databaseToMarkdownTable([], safeTitle);
                const filePath = join(currentDir, `${safeTitle}.md`);
                await writeFile(filePath, emptyTableMarkdown, "utf-8");
            }
        } catch (error) {
            console.error(`${indent}❌ 导出数据库失败 (${databaseId}):`, error instanceof Error ? error.message : String(error));
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
