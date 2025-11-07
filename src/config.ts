import { readFile } from "node:fs/promises";
import path from "node:path";

export interface ExportConfig {
    token: string;
    rootPageId: string;
    outDir: string;
    dryRun: boolean;
    maxDepth?: number;
    configPath?: string;
}

export interface ExportConfigInput {
    token?: string;
    root?: string;
    outDir?: string;
    dryRun?: boolean;
    maxDepth?: number | string;
    config?: string;
}

const DEFAULTS: Pick<ExportConfig, "outDir" | "dryRun"> = {
    outDir: "./export",
    dryRun: false,
};

/**
 * 加载最终运行配置，按 CLI > 配置文件 > 环境变量 > 默认值 合并。
 *
 * @param input CLI 解析得到的参数
 * @returns 标准化后的导出配置
 */
export async function loadConfig(input: ExportConfigInput): Promise<ExportConfig> {
    const fileConfig = input.config ? await readConfigFile(input.config) : {};
    const envConfig: Partial<ExportConfig> = {
        token: process.env.NOTION_TOKEN,
        rootPageId: process.env.NOTION_ROOT_PAGE_ID ?? process.env.NOTION_ROOT,
        maxDepth: toNumber(process.env.NOTION_MAX_DEPTH),
    };

    const merged: Partial<ExportConfig> = {
        ...DEFAULTS,
        ...fileConfig,
        ...envConfig,
        ...normalizeCliOptions(input),
    };

    if (!merged.token) {
        throw new Error("请通过 --token 或 NOTION_TOKEN 提供 Notion 集成 Token");
    }

    if (!merged.rootPageId) {
        throw new Error("请提供根页面 ID，可使用 --root 或 NOTION_ROOT_PAGE_ID");
    }

    return {
        token: merged.token,
        rootPageId: merged.rootPageId,
        outDir: merged.outDir ?? DEFAULTS.outDir,
        dryRun: merged.dryRun ?? DEFAULTS.dryRun,
        maxDepth: merged.maxDepth,
        configPath: input.config ? path.resolve(input.config) : undefined,
    };
}

interface FileConfigRaw {
    token?: unknown;
    rootPageId?: unknown;
    root?: unknown;
    outDir?: unknown;
    dryRun?: unknown;
    maxDepth?: unknown;
}

/**
 * 读取 JSON 配置文件并进行基本字段校验。
 *
 * @param configPath JSON 配置文件路径
 * @returns 配置片段
 */
async function readConfigFile(configPath: string): Promise<Partial<ExportConfig>> {
    const resolvedPath = path.resolve(configPath);
    const data = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(data) as FileConfigRaw;
    return {
        token: typeof parsed.token === "string" ? parsed.token : undefined,
        rootPageId:
            typeof parsed.rootPageId === "string"
                ? parsed.rootPageId
                : typeof parsed.root === "string"
                    ? parsed.root
                    : undefined,
        outDir: typeof parsed.outDir === "string" ? parsed.outDir : undefined,
        dryRun: typeof parsed.dryRun === "boolean" ? parsed.dryRun : undefined,
        maxDepth: toNumber(parsed.maxDepth),
    };
}

/**
 * 对 CLI 层面的输入做类型归一化。
 *
 * @param input CLI 参数
 * @returns 归一化后的部分配置
 */
function normalizeCliOptions(input: ExportConfigInput): Partial<ExportConfig> {
    return {
        token: input.token,
        rootPageId: input.root,
        outDir: input.outDir,
        dryRun: input.dryRun,
        maxDepth: toNumber(input.maxDepth),
    };
}

/**
 * 将字符串或数字参数转换为数字，无法解析时返回 undefined。
 *
 * @param value 待转换的值
 * @returns 解析成功的数字或 undefined
 */
function toNumber(value: number | string | undefined | unknown): number | undefined {
    if (typeof value === "number") {
        return Number.isNaN(value) ? undefined : value;
    }
    if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
}
