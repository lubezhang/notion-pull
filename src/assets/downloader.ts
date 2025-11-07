import axios from "axios";
import pLimit from "p-limit";
import { AssetDescriptor, AssetPlan, PageNode } from "../types";
import { Logger } from "../logger";

export interface AssetDownloader {
    collectAssets(page: PageNode, plans: AssetPlan[]): Promise<AssetDescriptor[]>;
}

interface AssetDownloaderOptions {
    logger: Logger;
    concurrency: number;
}

export function createAssetDownloader(options: AssetDownloaderOptions): AssetDownloader {
    const { logger, concurrency } = options;
    const limit = pLimit(Math.max(1, concurrency));

    return {
        async collectAssets(page, plans) {
            if (plans.length === 0) {
                logger.debug({ pageId: page.id }, "No assets detected for download");
                return [];
            }

            const uniquePlans = deduplicatePlans(plans);
            logger.info({ pageId: page.id, assets: uniquePlans.length }, "Starting asset downloads");
            const downloads = uniquePlans.map((plan) =>
                limit(async () => {
                    try {
                        const data = await downloadBinary(plan.originalUrl);
                        const descriptor: AssetDescriptor = {
                            ...plan,
                            data,
                        };
                        return descriptor;
                    } catch (error) {
                        logger.warn(
                            {
                                err: error,
                                pageId: page.id,
                                asset: plan.localPath,
                                url: plan.originalUrl,
                                reason: error instanceof Error ? error.message : String(error),
                            },
                            "Failed to download asset",
                        );
                        return undefined;
                    }
                }),
            );

            const results = await Promise.all(downloads);
            const successful = results.filter((item): item is AssetDescriptor => Boolean(item));
            logger.info({ pageId: page.id, success: successful.length, attempted: uniquePlans.length }, "Asset downloads completed");
            return successful;
        },
    };
}

function deduplicatePlans(plans: AssetPlan[]): AssetPlan[] {
    const seen = new Map<string, AssetPlan>();
    for (const plan of plans) {
        if (!seen.has(plan.localPath)) {
            seen.set(plan.localPath, plan);
        }
    }
    return Array.from(seen.values());
}

async function downloadBinary(url: string): Promise<Buffer> {
    const response = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        timeout: 30_000,
    });
    return Buffer.from(response.data);
}
