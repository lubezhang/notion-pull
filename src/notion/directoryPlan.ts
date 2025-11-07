import { Client } from "@notionhq/client";
import type {
    BlockObjectResponse,
    ListBlockChildrenResponse,
    PageObjectResponse,
    PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { NotionToMarkdown } from "notion-to-md";

export interface NotionDirectoryPlanOptions {
    token: string;
    rootPageId: string;
    maxDepth?: number;
}

export interface LeafPageExport {
    id: string;
    title?: string;
    relativeDir: string;
    fileName: string;
    content: string;
}

export interface NotionDirectoryPlan {
    rootDirectoryName: string;
    childDirectories: string[];
    leafPages: LeafPageExport[];
}

interface ChildPageInfo {
    id: string;
    title: string;
}

interface QueueItem {
    id: string;
    pathSegments: string[];
    isRoot: boolean;
    title?: string;
}

/**
 * 读取 Notion 页面层级，生成目录结构与叶子页面 Markdown 内容。
 *
 * @param options Notion 访问参数
 * @returns 根目录名称、需要创建的子目录以及 Markdown 页面列表
 */
export async function buildNotionDirectoryPlan(options: NotionDirectoryPlanOptions): Promise<NotionDirectoryPlan> {
    const client = new Client({ auth: options.token });
    const renderer = new NotionToMarkdown({ notionClient: client });
    const rootId = normalizePageId(options.rootPageId);
    const effectiveMaxDepth = typeof options.maxDepth === "number" && options.maxDepth > 0 ? options.maxDepth : undefined;

    const rootPage = await client.pages.retrieve({ page_id: rootId });
    const rootTitle = extractTitleFromPage(rootPage) ?? "Untitled Root";
    const rootDirectoryName = sanitizeSegment(rootTitle, "Untitled Root");

    const directorySet = new Set<string>();
    const leafPages: LeafPageExport[] = [];
    const queue: QueueItem[] = [{ id: rootId, pathSegments: [], isRoot: true, title: rootTitle }];
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
        const hasChildren = isDirectoryNode(childPages);

        if (hasChildren && current.pathSegments.length > 0) {
            directorySet.add(current.pathSegments.join("/"));
        } else if (!hasChildren) {
            const relativeDir = current.pathSegments.slice(0, -1).join("/");
            const fileBaseName =
                current.pathSegments.at(-1) ?? sanitizeSegment(current.title ?? rootDirectoryName, "Untitled Page");
            const fileName = ensureMarkdownExtension(fileBaseName);
            const content = await renderPageMarkdown(renderer, current.id);
            leafPages.push({
                id: current.id,
                title: current.title,
                relativeDir,
                fileName,
                content,
            });
        }

        for (const child of childPages) {
            const sanitizedTitle = sanitizeSegment(child.title, "Untitled Page");
            const nextSegments = [...current.pathSegments, sanitizedTitle];
            if (effectiveMaxDepth && nextSegments.length > effectiveMaxDepth) {
                continue;
            }
            queue.push({
                id: normalizePageId(child.id),
                pathSegments: nextSegments,
                isRoot: false,
                title: child.title,
            });
        }
    }

    return {
        rootDirectoryName,
        childDirectories: Array.from(directorySet),
        leafPages,
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
 * 使用 notion-to-md 将页面内容转换为 Markdown 字符串。
 *
 * @param renderer NotionToMarkdown 实例
 * @param pageId 页面 ID
 * @returns Markdown 文本
 */
async function renderPageMarkdown(renderer: NotionToMarkdown, pageId: string): Promise<string> {
    const blocks = await renderer.pageToMarkdown(pageId);
    const markdownObject = renderer.toMarkdownString(blocks);
    if (typeof markdownObject === "string") {
        return markdownObject;
    }

    const lines = [markdownObject.parent, ...(markdownObject.children ?? [])].filter(
        (line): line is string => typeof line === "string" && line.trim().length > 0,
    );
    return lines.join("\n");
}

/**
 * 确保文件名包含 .md 扩展名。
 *
 * @param fileBaseName 原始文件名
 * @returns 带扩展名的文件名
 */
function ensureMarkdownExtension(fileBaseName: string): string {
    return fileBaseName.toLowerCase().endsWith(".md") ? fileBaseName : `${fileBaseName}.md`;
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
