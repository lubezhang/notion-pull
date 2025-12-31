import { NotionToMarkdown as N2M } from "notion-to-md";
import { Client } from "@notionhq/client";

/**
 * Notion 块转 Markdown 转换器
 */
export default class NotionToMarkdown {
    private n2m: N2M;

    constructor(notion: Client) {
        this.n2m = new N2M({ notionClient: notion });
    }

    /**
     * 将 Notion 页面转换为 Markdown 字符串
     * @param pageId - Notion 页面 ID
     * @returns Markdown 格式的字符串
     */
    public async pageToMarkdown(pageId: string): Promise<string> {
        const mdBlocks = await this.n2m.pageToMarkdown(pageId);
        const markdown = this.n2m.toMarkdownString(mdBlocks);
        return markdown.parent;
    }
}
