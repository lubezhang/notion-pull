import { Client } from "@notionhq/client";
import type {
    BlockObjectResponse,
    ListBlockChildrenResponse,
    PageObjectResponse,
    PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

export interface NotionDirectoryPlanOptions {
    token: string;
    rootPageId: string;
    maxDepth?: number;
}

export interface NotionDirectoryPlan {
    rootDirectoryName: string;
    childDirectories: string[];
}

interface ChildPageInfo {
    id: string;
    title: string;
}

/**
 * 读取 Notion 页面层级并返回根目录名称及子目录列表。
 *
 * @param options Notion 访问参数
 * @returns 根目录名称与其子目录（相对于根）
 */
export async function buildNotionDirectoryPlan(options: NotionDirectoryPlanOptions): Promise<NotionDirectoryPlan> {
    const client = new Client({ auth: options.token });
    const rootId = normalizePageId(options.rootPageId);
    const effectiveMaxDepth = typeof options.maxDepth === "number" && options.maxDepth > 0 ? options.maxDepth : undefined;
    const rootPage = await client.pages.retrieve({ page_id: rootId });
    const rootTitle = extractTitleFromPage(rootPage) ?? "Untitled Root";
    const rootDirectoryName = sanitizeSegment(rootTitle, "Untitled Root");
    const directories: string[] = [];
    const queue: Array<{ id: string; pathSegments: string[] }> = [{ id: rootId, pathSegments: [] }];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
            break;
        }
        if (visited.has(current.id)) {
            continue;
        }
        visited.add(current.id);

        const childPages = await fetchChildPages(client, current.id);
        if (current.pathSegments.length > 0 && isDirectoryNode(childPages)) {
            directories.push(current.pathSegments.join("/"));
        }

        for (const child of childPages) {
            const sanitizedTitle = sanitizeSegment(child.title, "Untitled Page");
            const nextSegments = [...current.pathSegments, sanitizedTitle];
            if (effectiveMaxDepth && nextSegments.length > effectiveMaxDepth) {
                continue;
            }
            queue.push({ id: normalizePageId(child.id), pathSegments: nextSegments });
        }
    }

    return {
        rootDirectoryName,
        childDirectories: Array.from(new Set(directories)),
    };
}

/**
 * 获取给定页面（按 block 视角）的直接子页面。
 *
 * @param client Notion 客户端
 * @param blockId 页面对应的块 ID
 * @returns 子页面列表
 */
async function fetchChildPages(client: Client, blockId: string): Promise<ChildPageInfo[]> {
    const children: ChildPageInfo[] = [];
    let cursor: string | undefined;

    do {
        const response: ListBlockChildrenResponse = await client.blocks.children.list({
            block_id: blockId,
            page_size: 100,
            start_cursor: cursor,
        });

        for (const block of response.results as BlockObjectResponse[]) {
            if (block.type !== "child_page") {
                continue;
            }
            const childPage = block.child_page;
            if (!childPage) {
                continue;
            }
            children.push({ id: block.id, title: childPage.title ?? "Untitled Page" });
        }

        cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);

    return children;
}

/**
 * 规范化页面 ID，使其符合带连字符的 32 字符格式。
 *
 * @param id 原始页面 ID
 * @returns 规范化后的 ID
 */
function normalizePageId(id: string): string {
    const cleaned = id.replace(/-/g, "");
    if (cleaned.length !== 32) {
        return id;
    }
    return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
}

/**
 * 清洗路径片段中的非法字符，并提供兜底名称。
 *
 * @param segment 原始片段
 * @param fallback 兜底名称
 * @returns 处理后的片段
 */
function sanitizeSegment(segment: string, fallback: string): string {
    const trimmed = segment.trim();
    const sanitized = trimmed
        .replace(/[\\/:"*?<>|]+/g, "-")
        .replace(/\s+/g, " ")
        .replace(/\.+$/g, "")
        .replace(/^-+|-+$/g, "");

    if (sanitized.length === 0) {
        return fallback;
    }
    return sanitized;
}

/**
 * 判断页面是否需要作为目录创建，依据是否存在子页面。
 *
 * @param childPages 当前页面的子页面列表
 * @returns 若存在子页面则返回 true
 */
export function isDirectoryNode(childPages: ChildPageInfo[]): boolean {
    return childPages.length > 0;
}

/**
 * 从页面对象中提取标题文本。
 *
 * @param page Notion 页面对象
 * @returns 页面标题
 */
function extractTitleFromPage(page: PageObjectResponse | PartialPageObjectResponse): string | undefined {
    if (!("properties" in page)) {
        return undefined;
    }

    const properties = page.properties;
    if (!properties) {
        return undefined;
    }

    for (const property of Object.values(properties)) {
        if (!property || typeof property !== "object") {
            continue;
        }
        if ((property as { type?: string }).type === "title") {
            const titleItems = (property as { title?: Array<{ plain_text?: string }> }).title ?? [];
            return titleItems.map((item) => item.plain_text ?? "").join("");
        }
    }

    return undefined;
}
