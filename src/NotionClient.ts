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
    type: "page" | "database"; // 区分页面和数据库
}

/**
 * 将页面属性转换为 Markdown 格式
 */
export function propertiesToMarkdown(page: PageOrDatabase): string {
    if (!isFullPage(page) || !("properties" in page)) {
        return "";
    }

    const lines: string[] = [];
    let hasNonTitleProperties = false;

    for (const [propertyName, property] of Object.entries(page.properties)) {
        // 跳过标题属性(已经作为文件名)
        if (property.type === "title") {
            continue;
        }

        hasNonTitleProperties = true;
        let value = "";

        switch (property.type) {
            case "rich_text":
                value = property.rich_text.map(t => ("plain_text" in t ? t.plain_text : "")).join("");
                break;
            case "number":
                value = property.number !== null ? String(property.number) : "";
                break;
            case "select":
                value = property.select?.name || "";
                break;
            case "multi_select":
                value = property.multi_select.map(s => s.name).join(", ");
                break;
            case "date":
                if (property.date) {
                    value = property.date.end
                        ? `${property.date.start} → ${property.date.end}`
                        : property.date.start;
                }
                break;
            case "checkbox":
                value = property.checkbox ? "✓" : "☐";
                break;
            case "url":
                value = property.url || "";
                break;
            case "email":
                value = property.email || "";
                break;
            case "phone_number":
                value = property.phone_number || "";
                break;
            case "status":
                value = property.status?.name || "";
                break;
            // 可以继续添加其他属性类型
            default:
                value = `[${property.type}]`;
        }

        if (value) {
            lines.push(`**${propertyName}**: ${value}`);
        }
    }

    // 如果只有标题属性没有其他属性,返回一个占位符
    if (!hasNonTitleProperties) {
        return "_此页面仅包含标题,无其他内容_\n\n";
    }

    return lines.length > 0 ? lines.join("\n") + "\n\n" : "";
}

/**
 * 从页面属性中提取单元格值(用于表格)
 */
export function extractPropertyValue(property: any): string {
    if (!property) return "";

    switch (property.type) {
        case "title":
            return property.title?.map((t: any) => t.plain_text || "").join("") || "";
        case "rich_text":
            return property.rich_text?.map((t: any) => t.plain_text || "").join("") || "";
        case "number":
            return property.number !== null ? String(property.number) : "";
        case "select":
            return property.select?.name || "";
        case "multi_select":
            return property.multi_select?.map((s: any) => s.name).join(", ") || "";
        case "date":
            if (property.date) {
                return property.date.end
                    ? `${property.date.start} → ${property.date.end}`
                    : property.date.start;
            }
            return "";
        case "checkbox":
            return property.checkbox ? "✓" : "☐";
        case "url":
            return property.url || "";
        case "email":
            return property.email || "";
        case "phone_number":
            return property.phone_number || "";
        case "status":
            return property.status?.name || "";
        case "people":
            return property.people?.map((p: any) => p.name || "").join(", ") || "";
        case "files":
            return property.files?.map((f: any) => f.name || "").join(", ") || "";
        case "created_time":
            return property.created_time || "";
        case "last_edited_time":
            return property.last_edited_time || "";
        default:
            return `[${property.type}]`;
    }
}

export interface DatabaseToMarkdownOptions {
    databaseName?: string;
    parentPageTitle?: string;           // 父页面标题(用于生成返回链接)
    detailsDir?: string;                // 详情目录名称
    pagesWithDetails?: Set<string>;     // 有详情内容的页面ID集合
}

/**
 * 将数据库页面数组转换为 Markdown 表格
 */
export function databaseToMarkdownTable(pages: PageOrDatabase[], options: DatabaseToMarkdownOptions | string = "Database"): string {
    // 兼容旧版调用方式
    const opts: DatabaseToMarkdownOptions = typeof options === "string"
        ? { databaseName: options }
        : options;

    const databaseName = opts.databaseName || "Database";
    const parentPageTitle = opts.parentPageTitle;
    const detailsDir = opts.detailsDir;
    const pagesWithDetails = opts.pagesWithDetails;

    // 构建头部
    let header = `# ${databaseName}\n\n`;

    // 添加返回父页面的链接
    if (parentPageTitle) {
        header += `> 📂 所属页面: [${parentPageTitle}](../${encodeURIComponent(parentPageTitle)}.md)\n\n`;
    }

    if (pages.length === 0) {
        return header + `_数据库为空_\n`;
    }

    // 获取第一个完整页面来确定列
    const firstFullPage = pages.find(p => isFullPage(p) && "properties" in p);
    if (!firstFullPage || !("properties" in firstFullPage)) {
        return header + `_无法读取数据库结构_\n`;
    }

    // 提取所有属性名称作为列标题，并按照合理的顺序排列
    const properties = firstFullPage.properties;
    const allColumnNames = Object.keys(properties);

    // 将 title 类型的属性排在最前面，其他属性保持原有顺序
    const titleColumns = allColumnNames.filter(name => {
        const prop = properties[name];
        return prop && "type" in prop && prop.type === "title";
    });
    const otherColumns = allColumnNames.filter(name => {
        const prop = properties[name];
        return !prop || !("type" in prop) || prop.type !== "title";
    });

    const columnNames = [...titleColumns, ...otherColumns];

    // 判断是否需要添加详情链接列
    const hasDetailsColumn = detailsDir && pagesWithDetails && pagesWithDetails.size > 0;

    // 构建表格标题行
    const allColumns = hasDetailsColumn ? [...columnNames, "详情"] : columnNames;
    const headerRow = `| ${allColumns.join(" | ")} |`;
    const separatorRow = `| ${allColumns.map(() => "---").join(" | ")} |`;

    // 构建数据行
    const dataRows: string[] = [];
    for (const page of pages) {
        if (!isFullPage(page) || !("properties" in page)) {
            continue;
        }

        const cells = columnNames.map(colName => {
            const property = page.properties[colName];
            const value = extractPropertyValue(property);
            // 转义表格中的管道符和换行符
            return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
        });

        // 添加详情链接
        if (hasDetailsColumn) {
            if (pagesWithDetails.has(page.id)) {
                // 获取页面标题用于链接
                const titleProperty = Object.values(page.properties).find(p => p.type === "title");
                let pageTitle = "Untitled";
                if (titleProperty && titleProperty.type === "title" && Array.isArray(titleProperty.title)) {
                    pageTitle = titleProperty.title.map(t => "plain_text" in t ? t.plain_text : "").join("") || "Untitled";
                }
                // 清理文件名
                const safeTitle = pageTitle.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, " ").trim().substring(0, 200);
                cells.push(`[📄 详情](${encodeURIComponent(detailsDir)}/${encodeURIComponent(safeTitle)}.md)`);
            } else {
                cells.push("-");
            }
        }

        dataRows.push(`| ${cells.join(" | ")} |`);
    }

    // 组合成完整的 Markdown 表格
    return `${header}${headerRow}\n${separatorRow}\n${dataRows.join("\n")}\n`;
}

/**
 * Notion API 客户端封装
 */
export default class NotionClient {
    private notion: Client;

    constructor(authKey: string) {
        this.notion = new Client({
            auth: authKey,
            // 使用旧版 API 以兼容 databases.query
            notionVersion: "2022-06-28",
        });
    }

    /**
     * 获取 Notion Client 实例
     */
    public getClient(): Client {
        return this.notion;
    }

    /**
     * 获取页面或数据库信息
     * @param id - 页面或数据库 ID
     * @param type - 类型:page 或 database
     * @returns 页面或数据库对象
     */
    public async getPageOrDatabase(id: string, type: "page" | "database" = "page"): Promise<PageOrDatabase> {
        if (type === "database") {
            const response = await this.notion.databases.retrieve({ database_id: id });
            return response;
        } else {
            const response = await this.notion.pages.retrieve({ page_id: id });
            return response;
        }
    }

    /**
     * 获取页面信息(保留兼容性)
     * @param pageId - 页面 ID
     * @returns 页面对象
     */
    public async getPage(pageId: string): Promise<PageOrDatabase> {
        return this.getPageOrDatabase(pageId, "page");
    }

    /**
     * 获取页面标题
     * @param page - 页面对象
     * @returns 页面标题
     */
    public getPageTitle(page: PageOrDatabase): string {
        // 先检查是否是 Database 对象（Database 对象有 object 和 title 属性）
        if ("object" in page && page.object === "database" && "title" in page && Array.isArray(page.title)) {
            const titleText = page.title
                .map((text) => ("plain_text" in text ? text.plain_text : ""))
                .join("");
            return titleText || "Untitled";
        }

        // 检查是否是完整的 Page 对象
        if (!isFullPage(page)) {
            return "Untitled";
        }

        // 处理页面类型 - 从 properties 中查找 title 类型的属性
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
                        type: block.type === "child_page" ? "page" : "database", // 记录类型
                    });
                }
            }
        } catch (error) {
            console.error(`获取子页面失败 (${pageId}):`, error instanceof Error ? error.message : String(error));
        }

        return childPages;
    }

    /**
     * 分页查询数据库中的所有条目
     * @param databaseId - 数据库 ID
     * @yields 数据库中的每个页面对象
     */
    public async *queryDatabasePaginated(databaseId: string): AsyncGenerator<PageOrDatabase> {
        interface DatabaseQueryResponse {
            results: PageOrDatabase[];
            has_more: boolean;
            next_cursor: string | null;
        }

        let hasMore = true;
        let startCursor: string | undefined = undefined;

        while (hasMore) {
            const response: DatabaseQueryResponse = await this.notion.request<DatabaseQueryResponse>({
                path: `databases/${databaseId}/query`,
                method: "post",
                body: startCursor ? { start_cursor: startCursor } : {},
            });

            for (const page of response.results) {
                yield page;
            }

            hasMore = response.has_more;
            startCursor = response.next_cursor ?? undefined;
        }
    }
}