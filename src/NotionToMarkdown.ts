import { NotionToMarkdown as N2M } from "notion-to-md";
import { Client } from "@notionhq/client";
import type { MdBlock } from "notion-to-md/build/types";

export interface MediaLink {
    type: "image" | "file";
    url: string;
    altText?: string;
}

/**
 * Notion 块转 Markdown 转换器
 */
export default class NotionToMarkdown {
    private n2m: N2M;

    constructor(notion: Client) {
        this.n2m = new N2M({ notionClient: notion });
    }

    /**
     * 将 Notion 页面转换为 Markdown 字符串(仅包含页面内容,不包含子页面)
     * @param pageId - Notion 页面 ID
     * @returns Markdown 格式的字符串
     */
    public async pageToMarkdown(pageId: string): Promise<string> {
        // 获取页面的所有块
        const mdBlocks = await this.n2m.pageToMarkdown(pageId);

        // 过滤掉子页面和子数据库块
        const filteredBlocks = this.filterOutChildPages(mdBlocks);

        // 转换为 Markdown 字符串
        const markdownResult = this.n2m.toMarkdownString(filteredBlocks);

        // 处理可能的空内容情况
        if (!markdownResult || !markdownResult.parent) {
            return ""; // 返回空字符串而不是 undefined
        }

        return markdownResult.parent;
    }

    /**
     * 从 Markdown 内容中提取所有图片和文件链接
     * @param markdown - Markdown 文本内容
     * @returns 提取的媒体链接数组
     */
    public extractMediaLinks(markdown: string): MediaLink[] {
        const mediaLinks: MediaLink[] = [];

        // 匹配 Markdown 图片语法: ![alt](url)
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let match: RegExpExecArray | null;

        while ((match = imageRegex.exec(markdown)) !== null) {
            const altText = match[1];
            const url = match[2];

            // 只处理外部 URL（http/https），跳过已经是相对路径的
            if (url.startsWith("http://") || url.startsWith("https://")) {
                mediaLinks.push({
                    type: "image",
                    url: url,
                    altText: altText || undefined,
                });
            }
        }

        // 匹配 Markdown 链接语法: [text](url)
        // 只提取指向文件的链接（包含文件扩展名）
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

        while ((match = linkRegex.exec(markdown)) !== null) {
            const text = match[1];
            const url = match[2];

            // 只处理外部 URL，且排除已经被图片正则匹配的
            if ((url.startsWith("http://") || url.startsWith("https://")) && !markdown.substring(Math.max(0, match.index - 1), match.index).includes("!")) {
                // 检查 URL 是否看起来像文件（包含常见文件扩展名）
                const fileExtensions = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz|mp4|avi|mov|mp3|wav|txt|csv|json|xml)(\?|$)/i;
                if (fileExtensions.test(url)) {
                    mediaLinks.push({
                        type: "file",
                        url: url,
                        altText: text,
                    });
                }
            }
        }

        return mediaLinks;
    }

    /**
     * 替换 Markdown 中的 URL 为本地路径
     * @param markdown - 原始 Markdown 内容
     * @param urlMapping - URL 到本地路径的映射
     * @returns 替换后的 Markdown 内容
     */
    public replaceMediaUrls(markdown: string, urlMapping: Map<string, string>): string {
        let result = markdown;

        // 替换所有匹配的 URL
        for (const [originalUrl, localPath] of urlMapping.entries()) {
            // 转义 URL 中的特殊字符用于正则表达式
            const escapedUrl = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

            // 替换图片和链接中的 URL
            result = result.replace(new RegExp(escapedUrl, "g"), localPath);
        }

        return result;
    }

    /**
     * 递归过滤掉子页面和子数据库块
     * @param blocks - Markdown 块数组
     * @returns 过滤后的块数组
     */
    private filterOutChildPages(blocks: MdBlock[]): MdBlock[] {
        return blocks
            .filter(block => {
                // 排除 child_page 和 child_database 类型
                return block.type !== "child_page" && block.type !== "child_database";
            })
            .map(block => {
                // 如果块有子块,递归过滤
                if (block.children && block.children.length > 0) {
                    return {
                        ...block,
                        children: this.filterOutChildPages(block.children)
                    };
                }
                return block;
            });
    }
}
