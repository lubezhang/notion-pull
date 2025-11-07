import type { Buffer } from "node:buffer";

export interface NotionPage {
    id: string;
    properties?: Record<string, unknown>;
    [key: string]: unknown;
}

export interface RichBlock {
    id: string;
    type?: string;
    children?: RichBlock[];
    databaseRows?: NotionPage[];
    database?: unknown;
    [key: string]: unknown;
}

export interface PageNode {
    id: string;
    title: string;
    path: string[];
    type: "page";
    hasChildPages: boolean;
    page: NotionPage;
    blocks: RichBlock[];
}

export interface MarkdownResult {
    content: string;
    assets: AssetPlan[];
}

export interface AssetPlan {
    id: string;
    originalUrl: string;
    localPath: string;
    type: "image" | "file" | "audio" | "video" | "pdf" | "external";
    caption?: string;
    mimeType?: string;
}

export interface AssetDescriptor extends AssetPlan {
    data: Buffer;
}

export interface WritePageOptions {
    page: PageNode;
    markdown: MarkdownResult;
    assets: AssetDescriptor[];
}
