import { NotionToMarkdown as N2M } from "notion-to-md";
import { Client } from "@notionhq/client";
import type { MdBlock } from "notion-to-md/build/types";

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
