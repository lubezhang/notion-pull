import path from "node:path";
import type { PageNode } from "../types";

export interface PageLocation {
    directory: string;
    fileName: string;
    filePath: string;
    directorySegments: string[];
    fileBaseName: string;
}

interface PagePathPlannerOptions {
    baseDir: string;
}

/**
 * 负责根据 PageNode 构建最终的目录与文件路径，确保：
 * - 页面层级映射到目录层级；
 * - 顶层页面始终拥有一级目录；
 * - 只有包含子页面的节点才额外创建目录，否则直接落在父目录。
 */
export class PagePathPlanner {
    private readonly baseDir: string;

    constructor(options: PagePathPlannerOptions) {
        this.baseDir = options.baseDir;
    }

    /**
     * 计算页面的落盘位置。
     *
     * @param page PageNode，包含层级信息
     * @returns PageLocation，包含目录、文件名等信息
     */
    resolve(page: PageNode): PageLocation {
        const normalizedSegments = sanitizeSegments([...page.path, page.title]);
        const fileBaseName = normalizedSegments.at(-1) ?? page.id;
        const ancestorSegments = normalizedSegments.slice(0, -1);
        const needsOwnDirectory = page.hasChildPages || page.path.length === 0;
        const directorySegments = needsOwnDirectory ? [...ancestorSegments, fileBaseName] : ancestorSegments;
        const directory = directorySegments.length > 0 ? path.join(this.baseDir, ...directorySegments) : this.baseDir;
        const fileName = `${fileBaseName}.md`;
        const filePath = path.join(directory, fileName);

        return {
            directory,
            fileName,
            filePath,
            directorySegments,
            fileBaseName,
        };
    }
}

/**
 * 清洗路径片段，移除非法字符、尾随空格及点号。
 */
export function sanitizeSegments(segments: string[]): string[] {
    return segments.map((segment, index) => {
        const trimmed = segment.trim();
        const sanitized = trimmed
            .replace(/[\\/:"*?<>|]+/g, "-")
            .replace(/\s+/g, " ")
            .replace(/\.+$/g, "")
            .replace(/^-+|-+$/g, "");

        if (sanitized.length === 0) {
            return index === segments.length - 1 ? "Untitled Page" : "Untitled";
        }

        return sanitized;
    });
}
