import { access, mkdir, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { AssetDescriptor, WritePageOptions } from "../types";
import { Logger } from "../logger";
import { PagePathPlanner } from "./pathPlanner";

export interface OutputWriter {
    writePage(options: WritePageOptions): Promise<void>;
}

interface OutputWriterOptions {
    baseDir: string;
    dryRun: boolean;
    force: boolean;
    logger: Logger;
}

/**
 * 负责将渲染好的 Markdown 与资源落盘，目录结构委托给 PagePathPlanner 计算，
 * 默认规则为“顶层或包含子页面的节点拥有同名文件夹，叶子页面直接写在父目录”。
 *
 * @param options.baseDir 导出根目录
 * @param options.dryRun  是否仅打印不写文件
 * @param options.force   是否覆盖已有文件
 * @param options.logger  日志记录器
 * @returns OutputWriter 实例
 */
export function createOutputWriter(options: OutputWriterOptions): OutputWriter {
    const { baseDir, dryRun, force, logger } = options;
    const pathPlanner = new PagePathPlanner({ baseDir });

    return {
        /**
         * 将单个页面写入磁盘：创建多层目录、写 Markdown、同步资源。
         *
         * @param page      PageNode，包含标题、路径和块树
         * @param markdown  渲染器生成的 Markdown 内容与资源计划
         * @param assets    已下载好的资源数据
         */
        async writePage({ page, markdown, assets }: WritePageOptions): Promise<void> {
            const location = pathPlanner.resolve(page);
            const { directory, filePath } = location;

            if (dryRun) {
                logger.info({ filePath }, "Dry run: skipping write");
                return;
            }

            await mkdir(directory, { recursive: true });
            if (!force && (await exists(filePath))) {
                logger.info({ filePath }, "File exists - skipping (use --force to overwrite)");
                return;
            }

            await writeFile(filePath, markdown.content, "utf8");
            if (assets.length > 0) {
                await writeAssets(path.dirname(filePath), assets, logger, force);
            }

            logger.info({ filePath }, "Page written");
        },
    };
}

/**
 * 判断文件是否存在。
 *
 * @param filePath 目标路径
 * @returns 若存在则返回 true
 */
async function exists(filePath: string): Promise<boolean> {
    try {
        await access(filePath, fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * 根据下载结果写入页面资源，自动创建 `img/` 目录，并可选择覆盖。
 *
 * @param pageDir 页面所在目录
 * @param assets  需要写入的资源列表
 * @param logger  日志记录器
 * @param force   是否覆盖已有资源
 */
async function writeAssets(pageDir: string, assets: AssetDescriptor[], logger: Logger, force: boolean): Promise<void> {
    const assetDir = path.join(pageDir, "img");
    await mkdir(assetDir, { recursive: true });

    for (const asset of assets) {
        const destination = path.join(pageDir, asset.localPath);
        await mkdir(path.dirname(destination), { recursive: true });
        if (!force && (await exists(destination))) {
            logger.debug({ destination }, "Asset exists - skipping");
            continue;
        }
        await writeFile(destination, asset.data);
        logger.debug({ destination, source: asset.originalUrl }, "Asset written");
    }
}
