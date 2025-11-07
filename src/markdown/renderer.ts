import path from "node:path";
import { NotionToMarkdown } from "notion-to-md";
import type { ListBlockChildrenResponseResults, MdStringObject } from "notion-to-md/build/types";
import { Logger } from "../logger";
import { NotionClient } from "../notion/client";
import { AssetPlan, MarkdownResult, PageNode, RichBlock } from "../types";

export interface MarkdownRenderer {
    renderPage(page: PageNode): Promise<MarkdownResult>;
}

interface MarkdownRendererOptions {
    logger: Logger;
    notion: NotionClient;
}

interface RenderContext {
    logger: Logger;
    assets: AssetPlan[];
    usedAssetNames: Set<string>;
}

type RichTextSegment = {
    plain_text?: string;
    href?: string | null;
    type?: string;
    text?: {
        content?: string;
        link?: {
            url?: string | null;
        } | null;
    };
    annotations?: {
        bold?: boolean;
        italic?: boolean;
        strikethrough?: boolean;
        underline?: boolean;
        code?: boolean;
    };
    equation?: {
        expression?: string;
    };
    [key: string]: unknown;
};

export function createMarkdownRenderer(options: MarkdownRendererOptions): MarkdownRenderer {
    const { logger, notion } = options;

    return {
        async renderPage(page) {
            const context: RenderContext = {
                logger,
                assets: [],
                usedAssetNames: new Set<string>(),
            };

            logger.info({ pageId: page.id, title: page.title }, "Rendering page blocks to Markdown");

            const n2m = new NotionToMarkdown({ notionClient: notion });
            attachCustomTransformers(n2m, context);

            const mdBlocks = await n2m.blocksToMarkdown(page.blocks as unknown as ListBlockChildrenResponseResults);
            const mdObject = n2m.toMarkdownString(mdBlocks);
            const mdString = mergeMarkdownStrings(mdObject).trim();

            const sections: string[] = [`# ${page.title}`];
            if (mdString.length > 0) {
                sections.push(mdString);
            }

            logger.info({ pageId: page.id, assets: context.assets.length }, "Page rendering completed");

            return {
                content: `${sections.join("\n\n").trimEnd()}\n`,
                assets: context.assets,
            };
        },
    };
}

function attachCustomTransformers(n2m: NotionToMarkdown, context: RenderContext): void {
    n2m.setCustomTransformer("image", async (block) => renderImage(block as RichBlock, context));
    n2m.setCustomTransformer("file", async (block) => renderMedia(block as RichBlock, context));
    n2m.setCustomTransformer("pdf", async (block) => renderMedia(block as RichBlock, context));
    n2m.setCustomTransformer("audio", async (block) => renderMedia(block as RichBlock, context));
    n2m.setCustomTransformer("video", async (block) => renderMedia(block as RichBlock, context));
    n2m.setCustomTransformer("child_database", async (block) => renderDatabase(block as RichBlock, context));
    n2m.setCustomTransformer("child_page", async (block) => renderChildPage(block as RichBlock));
    n2m.setCustomTransformer("bookmark", async (block) => renderBookmark(block as RichBlock));
    n2m.setCustomTransformer("embed", async (block) => renderEmbed(blockTypePayload(block as RichBlock)));
    n2m.setCustomTransformer("link_preview", async (block) => renderEmbed(blockTypePayload(block as RichBlock)));
    n2m.setCustomTransformer("link_to_page", async (block) => renderEmbed(blockTypePayload(block as RichBlock)));
}

function renderImage(block: RichBlock, context: RenderContext): string {
    const payload = (block.image as Record<string, unknown>) ?? {};
    const file = (payload.file as Record<string, unknown>) ?? {};
    const external = (payload.external as Record<string, unknown>) ?? {};
    const source = typeof file.url === "string" ? file.url : typeof external.url === "string" ? external.url : undefined;
    if (!source) {
        return "";
    }

    const caption = richTextArrayToMarkdown((payload.caption as RichTextSegment[]) ?? []);
    const asset = createAsset(context, {
        id: block.id,
        url: source,
        caption,
        type: "image",
    });

    return `![${caption}](${formatAssetPath(asset.localPath)})`;
}

function renderMedia(block: RichBlock, context: RenderContext): string {
    const type = typeof block.type === "string" ? block.type : "file";
    const data = (block[type as keyof RichBlock] as Record<string, unknown>) ?? {};
    const file = (data.file as Record<string, unknown>) ?? {};
    const external = (data.external as Record<string, unknown>) ?? {};
    const source = typeof file.url === "string" ? file.url : typeof external.url === "string" ? external.url : undefined;
    if (!source) {
        return "";
    }

    const caption = Array.isArray(data.caption) ? richTextArrayToMarkdown(data.caption as RichTextSegment[]) : undefined;
    const asset = createAsset(context, {
        id: block.id,
        url: source,
        caption,
        type: mapMediaType(type),
    });

    const label = caption && caption.length > 0 ? caption : asset.localPath;
    return `[${label}](${formatAssetPath(asset.localPath)})`;
}

function renderDatabase(block: RichBlock, context: RenderContext): string {
    const childDatabase = block.child_database as { title?: string } | undefined;
    const title = typeof childDatabase?.title === "string" ? childDatabase.title : "Untitled Database";
    context.logger.info({ blockId: block.id, title }, "Skipping database export (not yet supported)");
    return `> Database "${title}" 未导出（功能待实现）`;
}

function renderChildPage(block: RichBlock): string {
    const childPage = block.child_page as { title?: string } | undefined;
    const title = typeof childPage?.title === "string" ? childPage.title : "Untitled page";
    return `> Child page: ${title}`;
}

function renderBookmark(block: RichBlock): string {
    const bookmark = (block.bookmark as Record<string, unknown>) ?? {};
    const url = typeof bookmark.url === "string" ? bookmark.url : "";
    const caption = Array.isArray(bookmark.caption)
        ? (bookmark.caption as RichTextSegment[]).map((segment) => segment.plain_text ?? "").join("")
        : undefined;
    const label = caption && caption.length > 0 ? caption : url;
    return url ? `[${label}](${url})` : "";
}

function renderEmbed(payload: { url?: string; page_id?: string; database_id?: string }): string {
    const url = payload.url ?? payload.page_id ?? payload.database_id;
    return url ? `[External Content](${url})` : "";
}

function richTextArrayToMarkdown(segments: RichTextSegment[]): string {
    if (!Array.isArray(segments) || segments.length === 0) {
        return "";
    }
    return segments.map(richTextItemToMarkdown).join("");
}

function richTextItemToMarkdown(segment: RichTextSegment): string {
    let text = segment.plain_text ?? segment.text?.content ?? "";

    const annotations = segment.annotations ?? {};
    const href = segment.href ?? segment.text?.link?.url ?? null;
    const type = segment.type ?? "text";

    if (type === "equation" && segment.equation?.expression) {
        text = `$${segment.equation.expression}$`;
    }

    if (href) {
        text = `[${text}](${href})`;
    }

    if (annotations.code) {
        return `\`${text}\``;
    }

    if (annotations.bold) {
        text = `**${text}**`;
    }
    if (annotations.italic) {
        text = `*${text}*`;
    }
    if (annotations.strikethrough) {
        text = `~~${text}~~`;
    }
    if (annotations.underline) {
        text = `<u>${text}</u>`;
    }

    return text;
}

function createAsset(
    context: RenderContext,
    options: { id: string; url: string; caption?: string; type: AssetPlan["type"] },
): AssetPlan {
    const extension = guessExtension(options.url, options.type);
    const baseName = sanitizeFileName(options.caption ?? options.id);
    const fileName = uniqueFileName(`${baseName}${extension}`, context.usedAssetNames);
    const localPath = path.posix.join("img", fileName);

    const asset: AssetPlan = {
        id: options.id,
        originalUrl: options.url,
        localPath,
        type: options.type,
        caption: options.caption,
    };
    context.assets.push(asset);
    return asset;
}

function uniqueFileName(candidate: string, used: Set<string>): string {
    if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
    }
    const { name, ext } = splitExtension(candidate);
    let index = 2;
    let next = `${name}-${index}${ext}`;
    while (used.has(next)) {
        index += 1;
        next = `${name}-${index}${ext}`;
    }
    used.add(next);
    return next;
}

function splitExtension(fileName: string): { name: string; ext: string } {
    const dotIndex = fileName.lastIndexOf(".");
    if (dotIndex <= 0) {
        return { name: fileName, ext: "" };
    }
    return { name: fileName.slice(0, dotIndex), ext: fileName.slice(dotIndex) };
}

function guessExtension(url: string, type: AssetPlan["type"]): string {
    const fromUrl = extractExtension(url);
    if (fromUrl) {
        return fromUrl;
    }
    switch (type) {
        case "image":
            return ".png";
        case "audio":
            return ".mp3";
        case "video":
            return ".mp4";
        case "pdf":
            return ".pdf";
        default:
            return ".bin";
    }
}

function extractExtension(url: string): string | undefined {
    try {
        const parsed = new URL(url);
        const lastSegment = parsed.pathname.split("/").pop() ?? "";
        const dotIndex = lastSegment.lastIndexOf(".");
        if (dotIndex > 0 && dotIndex < lastSegment.length - 1) {
            return lastSegment.slice(dotIndex);
        }
    } catch {
        return undefined;
    }
    return undefined;
}

function sanitizeFileName(value: string): string {
    return (
        value
            .trim()
            .replace(/[\\/:"*?<>|\s]+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "")
            .toLowerCase()
            .slice(0, 64) || "asset"
    );
}

function mapMediaType(type: string): AssetPlan["type"] {
    if (type === "audio" || type === "video" || type === "pdf" || type === "file") {
        return type;
    }
    return "external";
}

function escapePipes(value: string): string {
    return value.replace(/\|/g, "\\|");
}

function formatAssetPath(localPath: string): string {
    if (localPath.startsWith("./")) {
        return localPath;
    }
    return `./${localPath}`;
}

function formatPropertyValue(property: unknown): string {
    if (!property || typeof property !== "object") {
        return "";
    }

    const type = (property as { type?: string }).type;
    switch (type) {
        case "title":
        case "rich_text":
            return richTextArrayToMarkdown(((property as Record<string, unknown>)[type] as RichTextSegment[]) ?? []);
        case "number":
            return String((property as { number?: number | null }).number ?? "");
        case "date":
            return ((property as { date?: { start?: string | null } }).date?.start) ?? "";
        case "checkbox":
            return (property as { checkbox?: boolean }).checkbox ? "✅" : "❌";
        case "select":
            return (property as { select?: { name?: string } }).select?.name ?? "";
        case "multi_select":
            return ((property as { multi_select?: Array<{ name?: string }> }).multi_select ?? [])
                .map((item) => item.name ?? "")
                .join(", ");
        case "status":
            return (property as { status?: { name?: string } }).status?.name ?? "";
        case "url":
        case "email":
        case "phone_number":
            return ((property as Record<string, string | null | undefined>)[type] as string | null | undefined) ?? "";
        case "people":
            return ((property as { people?: Array<{ name?: string }> }).people ?? [])
                .map((person) => person.name ?? "")
                .join(", ");
        case "files":
            return ((property as { files?: Array<{ name?: string }> }).files ?? [])
                .map((file) => file.name ?? "")
                .join(", ");
        case "formula":
            return formatFormula((property as { formula?: Record<string, unknown> }).formula);
        case "rollup":
            return formatRollup((property as { rollup?: Record<string, unknown> }).rollup);
        default:
            return "";
    }
}

function formatFormula(formula: Record<string, unknown> | undefined): string {
    if (!formula || typeof formula !== "object") {
        return "";
    }
    if (typeof formula.string === "string") {
        return formula.string;
    }
    if (typeof formula.number === "number") {
        return String(formula.number);
    }
    if (typeof formula.boolean === "boolean") {
        return formula.boolean ? "true" : "false";
    }
    if (formula.date && typeof formula.date === "object") {
        return (formula.date as { start?: string | null }).start ?? "";
    }
    return "";
}

function formatRollup(rollup: Record<string, unknown> | undefined): string {
    if (!rollup || typeof rollup !== "object") {
        return "";
    }
    if (typeof rollup.number === "number") {
        return String(rollup.number);
    }
    if (rollup.date && typeof rollup.date === "object") {
        return (rollup.date as { start?: string | null }).start ?? "";
    }
    if (Array.isArray(rollup.array)) {
        return (rollup.array as Array<{ plain_text?: string }>)
            .map((item) => item.plain_text ?? "")
            .join(", ");
    }
    return "";
}

function blockTypePayload(block: RichBlock): { url?: string; page_id?: string; database_id?: string } {
    const payload = block[block.type as keyof RichBlock];
    if (!payload || typeof payload !== "object") {
        return {};
    }
    const data = payload as Record<string, unknown>;
    return {
        url: typeof data.url === "string" ? data.url : undefined,
        page_id: typeof data.page_id === "string" ? data.page_id : undefined,
        database_id: typeof data.database_id === "string" ? data.database_id : undefined,
    };
}

function mergeMarkdownStrings(mdObject: MdStringObject): string {
    const parentContent = (mdObject.parent ?? "").trim();
    if (parentContent.length > 0) {
        return parentContent;
    }

    const fallbackSections = Object.entries(mdObject)
        .filter(([key, value]) => key !== "parent" && value.trim().length > 0)
        .map(([key, value]) => {
            const title = key.trim();
            const body = value.trim();
            if (!title) {
                return body;
            }
            return `## ${title}\n\n${body}`;
        });

    return fallbackSections.join("\n\n");
}
