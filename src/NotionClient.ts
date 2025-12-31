import {
    Client,
    isFullPage,
    iteratePaginatedAPI,
} from "@notionhq/client";
import type {
    PageObjectResponse,
    PartialPageObjectResponse,
    DatabaseObjectResponse,
    PartialDatabaseObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

type PageOrDatabase =
    | PageObjectResponse
    | PartialPageObjectResponse
    | DatabaseObjectResponse
    | PartialDatabaseObjectResponse;

export interface ChildPageInfo {
    id: string;
    title: string;
}

/**
 * Notion API 客户端封装
 */
export default class NotionClient {
    private notion: Client;

    constructor(authKey: string) {
        this.notion = new Client({
            auth: authKey,
        });
    }

    /**
     * 获取 Notion Client 实例
     */
    public getClient(): Client {
        return this.notion;
    }

    /**
     * 获取页面信息
     * @param pageId - 页面 ID
     * @returns 页面对象
     */
    public async getPage(pageId: string): Promise<PageOrDatabase> {
        const response = await this.notion.pages.retrieve({ page_id: pageId });
        return response;
    }

    /**
     * 获取页面标题
     * @param page - 页面对象
     * @returns 页面标题
     */
    public getPageTitle(page: PageOrDatabase): string {
        if (!isFullPage(page)) {
            return "Untitled";
        }

        // 处理数据库类型
        if ("title" in page && Array.isArray(page.title)) {
            const titleText = page.title
                .map((text) => ("plain_text" in text ? text.plain_text : ""))
                .join("");
            return titleText || "Untitled";
        }

        // 处理页面类型
        if ("properties" in page) {
            for (const key in page.properties) {
                const property = page.properties[key];
                if (property.type === "title" && Array.isArray(property.title)) {
                    const titleText = property.title
                        .map((text) => ("plain_text" in text ? text.plain_text : ""))
                        .join("");
                    return titleText || "Untitled";
                }
            }
        }

        return "Untitled";
    }

    /**
     * 获取页面的所有子页面
     * @param pageId - 父页面 ID
     * @returns 子页面信息数组
     */
    public async getChildPages(pageId: string): Promise<ChildPageInfo[]> {
        const childPages: ChildPageInfo[] = [];

        try {
            // 获取所有块
            for await (const block of iteratePaginatedAPI(
                this.notion.blocks.children.list,
                {
                    block_id: pageId,
                }
            )) {
                // 只处理子页面和子数据库
                if (
                    "type" in block &&
                    (block.type === "child_page" || block.type === "child_database")
                ) {
                    const childId = block.id;
                    let childTitle = "Untitled";

                    if (block.type === "child_page" && "child_page" in block) {
                        childTitle = block.child_page.title || "Untitled";
                    } else if (block.type === "child_database" && "child_database" in block) {
                        childTitle = block.child_database.title || "Untitled";
                    }

                    childPages.push({
                        id: childId,
                        title: childTitle,
                    });
                }
            }
        } catch (error) {
            console.error(`获取子页面失败 (${pageId}):`, error instanceof Error ? error.message : String(error));
        }

        return childPages;
    }
}