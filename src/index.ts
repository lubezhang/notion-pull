import { ExportConfig } from "./config";
import { createLogger, createModuleLogger } from "./logger";
import { createNotionClient } from "./notion/client";
import { createTraversalService } from "./notion/traversal";
import { createMarkdownRenderer } from "./markdown/renderer";
import { createAssetDownloader } from "./assets/downloader";
import { createOutputWriter } from "./output/writer";

export async function runExport(config: ExportConfig): Promise<void> {
    const baseLogger = createLogger("pipeline");
    const logger = createModuleLogger(baseLogger, "pipeline");
    const notion = createNotionClient({ token: config.token, proxy: config.proxy });
    const traversal = createTraversalService({
        notion,
        logger: createModuleLogger(baseLogger, "traversal"),
        concurrency: config.concurrency,
    });
    const renderer = createMarkdownRenderer({ logger: createModuleLogger(baseLogger, "renderer"), notion });
    const downloader = createAssetDownloader({
        logger: createModuleLogger(baseLogger, "assets"),
        concurrency: config.downloadConcurrency,
    });
    const writer = createOutputWriter({
        baseDir: config.outDir,
        dryRun: config.dryRun,
        force: config.force,
        logger: createModuleLogger(baseLogger, "output"),
    });

    if (config.dryRun) {
        logger.info({ dryRun: true }, "Dry run enabled: files will not be written");
    }

    logger.info(
        {
            rootPageId: config.rootPageId ?? "workspace",
            outDir: config.outDir,
            concurrency: config.concurrency,
            downloadConcurrency: config.downloadConcurrency,
            proxyConfigured: Boolean(config.proxy),
        },
        "Starting export pipeline",
    );

    const stats = {
        total: 0,
        success: 0,
        skipped: 0,
        failed: 0,
    };

    await traversal.traverse(config.rootPageId, async (page) => {
        stats.total += 1;
        logger.info({ pageId: page.id, title: page.title }, "Processing page");

        try {
            const markdown = await renderer.renderPage(page);
            const assets = config.dryRun ? [] : await downloader.collectAssets(page, markdown.assets);

            await writer.writePage({
                page,
                markdown,
                assets,
            });
            stats.success += 1;
            logger.info({ pageId: page.id, title: page.title }, "Page exported successfully");
        } catch (error) {
            stats.failed += 1;
            logger.error(
                {
                    err: error,
                    pageId: page.id,
                    title: page.title,
                    reason: error instanceof Error ? error.message : String(error),
                },
                "Failed to export page",
            );
        }
    });

    const summary = {
        ...stats,
        skipped: stats.skipped,
    };

    logger.info(summary, "Export finished");
}
