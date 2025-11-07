import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetch } from "undici";
import type { LeafPageExport, PageAssetPlan } from "./notion/directoryPlan";
import type { Logger } from "./logger";

/**
 * 将准备好的 Markdown 页面写入磁盘，必要时自动创建目录。
 *
 * @param rootPath 根目录绝对路径
 * @param pages 待写入的页面列表
 * @param dryRun 是否仅打印计划
 */
export async function writeMarkdownPages(
    rootPath: string,
    pages: LeafPageExport[],
    dryRun: boolean,
    logger: Logger,
): Promise<void> {
    for (const page of pages) {
        const targetDir = page.relativeDir ? path.join(rootPath, page.relativeDir) : rootPath;
        const filePath = path.join(targetDir, page.fileName);
        logger.info("准备写入 Markdown", { filePath, attachments: page.assets.length, dryRun });
        if (dryRun) {
            logger.info("Dry Run: 计划写入文件", { filePath });
            await previewAttachments(targetDir, page.assets, logger);
            continue;
        }
        await mkdir(targetDir, { recursive: true });
        await writeFile(filePath, page.content, "utf8");
        logger.info("已写入文件", { filePath });
        await writeAttachments(targetDir, page.assets, logger);
    }
}

async function previewAttachments(targetDir: string, assets: PageAssetPlan[], logger: Logger): Promise<void> {
    if (assets.length === 0) {
        return;
    }
    logger.info("Dry Run: 计划下载附件", { count: assets.length, targetDir });
    for (const asset of assets) {
        const assetPath = path.join(targetDir, "attachments", asset.localFileName);
        logger.info("Dry Run: 计划下载附件", { assetPath });
    }
}

async function writeAttachments(targetDir: string, assets: PageAssetPlan[], logger: Logger): Promise<void> {
    if (assets.length === 0) {
        return;
    }
    const attachmentsDir = path.join(targetDir, "attachments");
    await mkdir(attachmentsDir, { recursive: true });
    logger.info("开始下载附件", { count: assets.length, attachmentsDir });

    for (const asset of assets) {
        const assetPath = path.join(attachmentsDir, asset.localFileName);
        try {
            const response = await fetch(asset.sourceUrl);
            if (!response.ok) {
                logger.warn("附件下载失败", { url: asset.sourceUrl, status: response.status, assetPath });
                continue;
            }
            const arrayBuffer = await response.arrayBuffer();
            await writeFile(assetPath, Buffer.from(arrayBuffer));
            logger.info("已下载附件", { assetPath });
        } catch (error) {
            logger.warn("附件下载异常", { url: asset.sourceUrl, assetPath, error: error instanceof Error ? error.message : String(error) });
        }
    }
}
