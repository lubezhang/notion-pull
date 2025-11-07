import { isNotionClientError, APIErrorCode } from "@notionhq/client";
import pLimit from "p-limit";
import { NotionClient } from "./client";
import { Logger } from "../logger";
import { PageNode, RichBlock, NotionPage } from "../types";

export interface TraversalService {
    traverse(rootPageId: string | undefined, handler: (page: PageNode) => Promise<void>): Promise<void>;
}

interface TraversalOptions {
    notion: NotionClient;
    logger: Logger;
    concurrency: number;
}

interface QueueItem {
    id: string;
    path: string[];
}

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 500;

/**
 * 负责从指定根节点开始遍历整个 Notion 空间（或集成可访问的所有顶层页面），
 * 并把每个页面以 PageNode 形式交给上层处理。
 *
 * @param options.notion 实例化后的 Notion SDK 客户端
 * @param options.logger 模块化 logger，记录遍历日志
 * @param options.concurrency 在 handler 阶段的最大并发度
 * @returns 封装 traverse 方法的服务
 */
export function createTraversalService(options: TraversalOptions): TraversalService {
    const { notion, logger, concurrency } = options;
    const limit = pLimit(Math.max(1, concurrency));

    return {
        async traverse(rootPageId, handler): Promise<void> {
            /**
             * BFS 队列，元素中 path 记录从根到当前页面的标题路径
             */
            const queue: QueueItem[] = [];
            const visited = new Set<string>();

            logger.info({ rootPageId: rootPageId ?? "workspace" }, "Traversal initialized");

            if (rootPageId) {
                // 指定根页面时，以它为唯一入口并保留空路径（后续会按标题拼接层级）
                queue.push({ id: normalizeId(rootPageId), path: [] });
            } else {
                // 没有指定根页面则通过 search API 找出集成可访问的顶层页面
                const roots = await fetchRootPages();
                queue.push(...roots);
                logger.info({ discovered: roots.length }, "Discovered root pages");
            }

            const pending: Promise<void>[] = [];

            while (queue.length > 0) {
                const current = queue.shift();
                if (!current) {
                    break;
                }

                if (visited.has(current.id)) {
                    continue;
                }

                visited.add(current.id);

                try {
                    const { node, childPages } = await buildPageNode(current.id, current.path);
                    // child_page 只会包含页面级别的子节点，这里以 BFS 继续入队
                    for (const child of childPages) {
                        const childPath = [...current.path, node.title];
                        queue.push({ id: child.id, path: childPath });
                        logger.debug({ parentId: node.id, childId: child.id }, "Queued child page");
                    }

                    pending.push(
                        limit(async () => {
                            await handler(node);
                        }),
                    );
                } catch (error) {
                    logger.error(
                        {
                            err: error,
                            pageId: current.id,
                            reason: error instanceof Error ? error.message : String(error),
                        },
                        "Failed to load page",
                    );
                }
            }

            await Promise.all(pending);
            logger.info({ processed: visited.size }, "Traversal completed");
        },
    };

    /**
     * 利用 search API 枚举当前集成权限下的所有顶层页面，作为遍历入口。
     *
     * @returns 以队列项形式表示的根页面集合
     */
    async function fetchRootPages(): Promise<QueueItem[]> {
        const roots: QueueItem[] = [];
        let cursor: string | undefined;

        do {
            const response = await withRetries(() =>
                notion.search({
                    page_size: 100,
                    start_cursor: cursor,
                    filter: {
                        property: "object",
                        value: "page",
                    },
                }),
            );

            for (const result of response.results as Array<Record<string, unknown>>) {
                if (result.object !== "page") {
                    continue;
                }
                if (!isFullPage(result)) {
                    continue;
                }
                const title = extractTitle(result) ?? "untitled";
                roots.push({
                    id: normalizeId(String(result.id ?? "")),
                    path: [],
                });
                logger.debug({ pageId: result.id, title }, "Queued root page");
            }

            cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
        } while (cursor);

        return roots;
    }

    /**
     * 获取页面详情与完整块树，封装为 PageNode，供渲染器直接使用。
     *
     * @param pageId Notion 页面 ID（允许无短横线）
     * @param path   当前页面的父级路径（用于还原目录结构）
     * @returns PageNode，包含页面属性与块树
     */
    async function buildPageNode(pageId: string, path: string[]): Promise<{ node: PageNode; childPages: QueueItem[] }> {
        const page = await withRetries(() => notion.pages.retrieve({ page_id: formatId(pageId) }));
        if (!isFullPage(page)) {
            throw new Error(`Unable to retrieve properties for page ${pageId}`);
        }
        const title = extractTitle(page) ?? "untitled";

        logger.debug({ pageId, title }, "Building page node");

        const blocks = await fetchBlocksRecursively(pageId);
        const childPages = extractChildPages(blocks);

        return {
            node: {
                id: normalizeId(String(page.id)),
                title,
                path,
                type: "page",
                hasChildPages: childPages.length > 0,
                page,
                blocks,
            },
            childPages,
        };
    }

    /**
     * 深度遍历 block.children.list，直到构建出整棵块树。
     *
     * @param blockId Notion block id，将作为起点继续向下抓取
     * @returns RichBlock 数组，保留嵌套 children
     */
    async function fetchBlocksRecursively(blockId: string): Promise<RichBlock[]> {
        const blocks: RichBlock[] = [];
        let cursor: string | undefined;

        do {
            const response = await withRetries(() =>
                notion.blocks.children.list({
                    block_id: formatId(blockId),
                    page_size: 100,
                    start_cursor: cursor,
                }),
            );

            for (const block of response.results as Array<Record<string, unknown>>) {
                const blockIdCurrent = String(block.id ?? "");
                const blockType = typeof block.type === "string" ? (block.type as string) : undefined;
                const richBlock: RichBlock = {
                    id: blockIdCurrent,
                    type: blockType,
                    ...block,
                };

                if ((block as { has_children?: boolean }).has_children) {
                    richBlock.children = await fetchBlocksRecursively(blockIdCurrent);
                }

                blocks.push(richBlock);
            }

            cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
        } while (cursor);

        return blocks;
    }

    /**
     * 在块树中查找 child_page 块，以便继续 BFS。
     *
     * @param blocks 当前页面的所有块
     * @returns 子页面队列项，仅包含 id，路径由父节点追加
     */
    function extractChildPages(blocks: RichBlock[]): QueueItem[] {
        const queueItems: QueueItem[] = [];

        for (const block of blocks) {
            const blockObject = (block as { object?: string }).object;
            if (blockObject === "block" && block.type === "child_page") {
                queueItems.push({
                    id: normalizeId(block.id),
                    path: [],
                });
            }

            if (block.children) {
                queueItems.push(...extractChildPages(block.children));
            }
        }

        return queueItems;
    }

    /**
     * 从 properties 中找出 title 属性并拼接 plain_text，作为本地文件名。
     *
     * @param page Notion 原始页面对象
     * @returns 若存在 title 属性则返回拼接结果，否则 undefined
     */
    function extractTitle(page: NotionPage): string | undefined {
        const properties = page.properties;
        if (!properties) {
            return undefined;
        }
        const titleProperty = Object.values(properties).find((property) => (property as { type?: string })?.type === "title") as
            | { type: "title"; title: Array<{ plain_text: string }> }
            | undefined;
        if (!titleProperty) {
            return undefined;
        }
        return titleProperty.title.map((item) => item.plain_text).join("") || undefined;
    }

    function normalizeId(id: string): string {
        const stripped = id.replace(/-/g, "");
        return stripped.length === 32 ? stripped : id;
    }

    function isFullPage(page: unknown): page is NotionPage {
        return Boolean(page && typeof page === "object" && "properties" in (page as Record<string, unknown>));
    }

    function formatId(id: string): string {
        const cleaned = id.replace(/-/g, "");
        if (cleaned.length !== 32) {
            return id;
        }
        return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
    }
}

const NETWORK_ERROR_CODES = new Set([
    "ETIMEDOUT",
    "ECONNRESET",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "EPIPE",
    "EHOSTUNREACH",
    "ERR_SOCKET_TIMEOUT",
]);

/**
 * 对 Notion API 调用添加指数退避重试，既处理官方限流，也兜底常见网络抖动。
 *
 * @param operation 待执行的异步操作
 * @param attempt   当前尝试次数，默认 1
 * @returns operation 的执行结果
 * @throws 若达到最大尝试次数仍失败则抛出最后一次异常
 */
async function withRetries<T>(operation: () => Promise<T>, attempt = 1): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (attempt >= MAX_RETRIES) {
            throw error;
        }

        if (isNotionClientError(error)) {
            if (!isRetryableNotionError(error)) {
                throw error;
            }
        } else if (!isNetworkError(error)) {
            throw error;
        }

        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
        return withRetries(operation, attempt + 1);
    }
}

/**
 * 判断 Notion Client Error 是否可重试（限流或 5xx）。
 *
 * @param error Notion SDK 抛出的异常
 * @returns 布尔值，指示是否继续重试
 */
function isRetryableNotionError(error: unknown): error is { code: APIErrorCode } {
    if (!error || typeof error !== "object") {
        return false;
    }

    const notionError = error as { code?: APIErrorCode; status?: number };
    if (notionError.code === APIErrorCode.RateLimited) {
        return true;
    }

    if (typeof notionError.status === "number" && notionError.status >= 500) {
        return true;
    }

    return false;
}

/**
 * 判断 undici/Node 抛出的错误是否由网络故障导致。
 *
 * @param error 可能包含 code/cause 的异常对象
 * @returns 若识别为网络错误则为 true
 */
function isNetworkError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    if (error instanceof TypeError && typeof error.message === "string" && error.message.includes("fetch failed")) {
        return true;
    }

    if (error instanceof AggregateError) {
        for (const inner of error.errors ?? []) {
            if (isNetworkError(inner)) {
                return true;
            }
        }
    }

    const directCode = (error as { code?: string }).code;
    if (typeof directCode === "string" && NETWORK_ERROR_CODES.has(directCode)) {
        return true;
    }

    const cause = (error as { cause?: unknown }).cause;
    if (cause && typeof cause === "object") {
        const causeCode = (cause as { code?: string }).code;
        if (typeof causeCode === "string" && NETWORK_ERROR_CODES.has(causeCode)) {
            return true;
        }
    }

    return false;
}

/**
 * Promise 版 sleep，方便实现指数退避。
 *
 * @param duration 延迟时间（毫秒）
 */
async function sleep(duration: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, duration));
}
