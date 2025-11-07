import { Client } from "@notionhq/client";
import type {
    BlockObjectResponse,
    ListBlockChildrenResponse,
    PageObjectResponse,
    PartialPageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";
import { NotionToMarkdown } from "notion-to-md";
import type { Logger } from "../logger";

export interface NotionDirectoryPlanOptions {
    token: string;
    rootPageId: string;
    maxDepth?: number;
    logger?: Logger;
    onRootResolved?: (rootDirectoryName: string) => Promise<void> | void;
    onLeafPage?: (page: LeafPageExport) => Promise<void> | void;
}

export interface PageAssetPlan {
    id: string;
    sourceUrl: string;
    localFileName: string;
    caption?: string;
}

export interface LeafPageExport {
    id: string;
    title?: string;
    relativeDir: string;
    fileName: string;
    content: string;
    assets: PageAssetPlan[];
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

interface RawAssetPlan {
    id: string;
    sourceUrl: string;
    caption?: string;
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
    const logger = options.logger;
    const client = new Client({ auth: options.token });
    const renderer = new NotionToMarkdown({ notionClient: client });
    const rootId = normalizePageId(options.rootPageId);
    const effectiveMaxDepth = typeof options.maxDepth === "number" && options.maxDepth > 0 ? options.maxDepth : undefined;
    logger?.info("开始构建 Notion 目录计划", { rootId, maxDepth: effectiveMaxDepth ?? "unlimited" });

    const rootPage = await client.pages.retrieve({ page_id: rootId });
    const rootTitle = extractTitleFromPage(rootPage) ?? "Untitled Root";
    const rootDirectoryName = sanitizeSegment(rootTitle, "Untitled Root");
    await options.onRootResolved?.(rootDirectoryName);
    logger?.debug("根页面信息", { rootDirectoryName });

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
        logger?.debug("处理页面", { pageId: current.id, depth: current.pathSegments.length });

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
            const rawAssets = await collectPageAssets(client, current.id, logger?.child("assets"));
            const assets = assignAssetFileNames(rawAssets);
            const rewrittenContent = rewriteAssetReferences(content, assets);
            const pagePlan: LeafPageExport = {
                id: current.id,
                title: current.title,
                relativeDir,
                fileName,
                content: rewrittenContent,
                assets,
            };
            if (options.onLeafPage) {
                await options.onLeafPage(pagePlan);
            } else {
                leafPages.push(pagePlan);
            }
            logger?.info("生成叶子页面计划", {
                pageId: current.id,
                filePath: relativeDir ? `${relativeDir}/${fileName}` : fileName,
                attachments: assets.length,
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
            logger?.debug("加入子页面队列", { pageId: child.id, depth: nextSegments.length });
        }
    }

    logger?.info("目录计划构建完成", {
        directories: directorySet.size,
        pages: leafPages.length,
    });

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
 * 遍历页面所有块并提取附件资源信息。
 *
 * @param client Notion 客户端
 * @param pageId 页面 ID
 * @returns 资源列表
 */
async function collectPageAssets(client: Client, pageId: string, logger?: Logger): Promise<RawAssetPlan[]> {
    const assets: RawAssetPlan[] = [];
    const visited = new Set<string>();
    logger?.debug("开始收集页面附件", { pageId });
    await walkBlocks(client, pageId, assets, visited, logger);
    logger?.info("页面附件收集完成", { pageId, count: assets.length });
    return assets;
}

async function walkBlocks(
    client: Client,
    blockId: string,
    assets: RawAssetPlan[],
    visited: Set<string>,
    logger?: Logger,
): Promise<void> {
    let cursor: string | undefined;
    do {
        const response: ListBlockChildrenResponse = await client.blocks.children.list({
            block_id: blockId,
            page_size: 100,
            start_cursor: cursor,
        });

        for (const block of response.results as BlockObjectResponse[]) {
            if (visited.has(block.id)) {
                continue;
            }
            visited.add(block.id);

            const asset = extractAssetFromBlock(block);
            if (asset) {
                assets.push(asset);
                logger?.debug("发现附件", { blockId: block.id, url: asset.sourceUrl });
            }

            if (block.has_children) {
                await walkBlocks(client, block.id, assets, visited, logger);
            }
        }

        cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
    } while (cursor);
}

function extractAssetFromBlock(block: BlockObjectResponse): RawAssetPlan | undefined {
    switch (block.type) {
        case "image":
            return normalizeAsset(block.id, block.image?.type === "file" ? block.image.file?.url : block.image?.external?.url, {
                caption: extractRichTextPlain(block.image?.caption ?? []),
            });
        case "file":
            return normalizeAsset(block.id, block.file?.type === "file" ? block.file.file?.url : block.file?.external?.url, {
                caption: extractRichTextPlain(block.file?.caption ?? []),
            });
        case "pdf":
            return normalizeAsset(block.id, block.pdf?.type === "file" ? block.pdf.file?.url : block.pdf?.external?.url, {
                caption: extractRichTextPlain(block.pdf?.caption ?? []),
            });
        case "audio":
            return normalizeAsset(block.id, block.audio?.type === "file" ? block.audio.file?.url : block.audio?.external?.url, {
                caption: extractRichTextPlain(block.audio?.caption ?? []),
            });
        case "video":
            return normalizeAsset(block.id, block.video?.type === "file" ? block.video.file?.url : block.video?.external?.url, {
                caption: extractRichTextPlain(block.video?.caption ?? []),
            });
        default:
            return undefined;
    }
}

function normalizeAsset(
    id: string,
    sourceUrl: string | undefined,
    meta: { caption?: string },
): RawAssetPlan | undefined {
    if (!sourceUrl) {
        return undefined;
    }
    return {
        id,
        sourceUrl,
        caption: meta.caption,
    };
}

function assignAssetFileNames(assets: RawAssetPlan[]): PageAssetPlan[] {
    const usedNames = new Set<string>();
    return assets.map((asset, index) => {
        const extractedName = extractFileNameFromUrl(asset.sourceUrl) ?? `attachment-${index + 1}`;
        const localFileName = ensureUniqueFileName(extractedName, usedNames);
        return {
            ...asset,
            localFileName,
        };
    });
}

function rewriteAssetReferences(content: string, assets: PageAssetPlan[]): string {
    let updated = content;
    for (const asset of assets) {
        const localPath = `./attachments/${asset.localFileName}`;
        updated = updated.split(asset.sourceUrl).join(localPath);
    }
    return updated;
}

function extractFileNameFromUrl(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        const pathname = parsed.pathname.split("/").filter(Boolean);
        const rawName = pathname.at(-1);
        if (!rawName) {
            return undefined;
        }
        return rawName.split("?")[0];
    } catch {
        return undefined;
    }
}

function ensureUniqueFileName(fileName: string, usedNames: Set<string>): string {
    const sanitized = sanitizeFileName(fileName, "attachment");
    if (!usedNames.has(sanitized)) {
        usedNames.add(sanitized);
        return sanitized;
    }
    const dotIndex = sanitized.lastIndexOf(".");
    const base = dotIndex > 0 ? sanitized.slice(0, dotIndex) : sanitized;
    const ext = dotIndex > 0 ? sanitized.slice(dotIndex) : "";
    let counter = 1;
    let candidate = `${base}-${counter}${ext}`;
    while (usedNames.has(candidate)) {
        counter += 1;
        candidate = `${base}-${counter}${ext}`;
    }
    usedNames.add(candidate);
    return candidate;
}

function sanitizeFileName(fileName: string, fallback: string): string {
    const normalized = fileName.trim();
    if (normalized.length === 0) {
        return `${fallback}.bin`;
    }
    const dotIndex = normalized.lastIndexOf(".");
    const base = dotIndex > 0 ? normalized.slice(0, dotIndex) : normalized;
    const ext = dotIndex > 0 ? normalized.slice(dotIndex) : "";
    const sanitizedBase = sanitizeSegment(base, fallback);
    const safeExt = ext.replace(/[^A-Za-z0-9.]+/g, "");
    const finalExt = safeExt.length > 0 ? safeExt : ".bin";
    if (sanitizedBase.length === 0) {
        return `${fallback}${finalExt}`;
    }
    return `${sanitizedBase}${finalExt}`;
}

function extractRichTextPlain(richText: Array<{ plain_text?: string }>): string | undefined {
    const text = richText.map((item) => item.plain_text ?? "").join("").trim();
    return text.length > 0 ? text : undefined;
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
