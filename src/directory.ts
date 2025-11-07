import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Logger } from "./logger";

export interface DirectoryCreationResult {
    absolutePath: string;
    relativePath: string;
    skipped: boolean;
}

export interface DirectoryPlanOptions {
    outDir: string;
    dryRun: boolean;
}

export interface RootDirectoryCreation {
    rootPath: string;
    result: DirectoryCreationResult;
}

/**
 * 创建根页面对应的目录，所有后续子目录都会挂载在其下。
 *
 * @param options 目录创建基础参数
 * @param rootDirectoryName 根页面目录名
 * @returns 根目录的创建结果及绝对路径
 */
export async function createRootDirectory(
    options: DirectoryPlanOptions,
    rootDirectoryName: string,
    logger: Logger,
): Promise<RootDirectoryCreation> {
    const baseDir = path.resolve(options.outDir);
    const rootPath = path.join(baseDir, rootDirectoryName);

    if (!options.dryRun) {
        await mkdir(rootPath, { recursive: true });
        logger.info("已创建根目录", { rootPath });
    } else {
        logger.info("Dry Run: 计划创建根目录", { rootPath });
    }

    return {
        rootPath,
        result: {
            absolutePath: rootPath,
            relativePath: rootDirectoryName || ".",
            skipped: options.dryRun,
        },
    };
}

/**
 * 在根目录下创建所有子目录，路径以根目录为起点。
 *
 * @param rootPath 根目录的绝对路径
 * @param directories 以根为基准的相对目录列表
 * @param dryRun 是否只打印计划
 * @returns 每个子目录的创建结果
 */
export async function ensureChildDirectories(
    rootPath: string,
    directories: string[],
    dryRun: boolean,
    logger: Logger,
): Promise<DirectoryCreationResult[]> {
    const normalizedDirs = directories.map((dir) => dir.trim()).filter((dir) => dir.length > 0);
    const uniqueDirs = Array.from(new Set(normalizedDirs));
    const targets: string[] = [];

    for (const dir of uniqueDirs) {
        const segments = dir.split(/[\\/]+/).filter((segment) => segment.length > 0);
        if (segments.length === 0) {
            continue;
        }
        const target = path.join(rootPath, ...segments);
        appendUnique(targets, target);
    }

    const results: DirectoryCreationResult[] = [];
    for (const target of targets) {
        const relativePath = path.relative(rootPath, target) || ".";
        if (!dryRun) {
            await mkdir(target, { recursive: true });
            logger.info("已创建目录", { path: target });
        } else {
            logger.info("Dry Run: 计划创建目录", { path: target });
        }
        results.push({
            absolutePath: target,
            relativePath,
            skipped: dryRun,
        });
    }

    return results;
}

/**
 * 仅当路径不存在于列表中时才追加，保持遍历顺序。
 *
 * @param list 已收集的路径
 * @param value 待追加路径
 */
function appendUnique(list: string[], value: string): void {
    if (!list.includes(value)) {
        list.push(value);
    }
}
