import { readFile } from "node:fs/promises";
import path from "node:path";

export interface ExportConfig {
  token: string;
  rootPageId?: string;
  outDir: string;
  concurrency: number;
  downloadConcurrency: number;
  force: boolean;
  dryRun: boolean;
  configPath?: string;
  proxy?: string;
}

export interface ExportConfigInput {
  token?: string;
  root?: string;
  outDir?: string;
  concurrency?: number | string;
  downloadConcurrency?: number | string;
  force?: boolean;
  dryRun?: boolean;
  config?: string;
  proxy?: string;
}

const DEFAULTS: Omit<ExportConfig, "token"> = {
  outDir: "./export",
  concurrency: 4,
  downloadConcurrency: 4,
  force: false,
  dryRun: false,
};

export async function loadConfig(input: ExportConfigInput): Promise<ExportConfig> {
  const fileConfig = input.config ? await readConfigFile(input.config) : {};
  const envConfig: Partial<ExportConfig> = {
    token: process.env.NOTION_TOKEN,
    rootPageId: process.env.NOTION_ROOT_PAGE_ID ?? process.env.NOTION_ROOT,
    proxy: process.env.NOTION_PROXY ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY,
  };

  const merged = {
    ...DEFAULTS,
    ...fileConfig,
    ...envConfig,
    ...normalizeCliOptions(input),
  };

  if (!merged.token) {
    throw new Error("Notion token not provided. Use --token or set NOTION_TOKEN.");
  }

  return {
    token: merged.token,
    rootPageId: merged.rootPageId,
    outDir: merged.outDir ?? DEFAULTS.outDir,
    concurrency: merged.concurrency ?? DEFAULTS.concurrency,
    downloadConcurrency: merged.downloadConcurrency ?? DEFAULTS.downloadConcurrency,
    force: merged.force ?? DEFAULTS.force,
    dryRun: merged.dryRun ?? DEFAULTS.dryRun,
    configPath: input.config ? path.resolve(input.config) : undefined,
    proxy: merged.proxy,
  };
}

interface FileConfigRaw extends Partial<ExportConfig> {
  root?: string;
}

async function readConfigFile(configPath: string): Promise<Partial<ExportConfig>> {
  const resolvedPath = path.resolve(configPath);
  const data = await readFile(resolvedPath, "utf8");
  const parsed = JSON.parse(data) as FileConfigRaw;
  const normalized: Partial<ExportConfig> = {
    ...parsed,
  };
  if (typeof parsed.root === "string" && typeof parsed.rootPageId !== "string") {
    normalized.rootPageId = parsed.root;
  }
  return normalized;
}

function normalizeCliOptions(input: ExportConfigInput): Partial<ExportConfig> {
  return {
    token: input.token,
    rootPageId: input.root,
    outDir: input.outDir,
    concurrency: toNumber(input.concurrency),
    downloadConcurrency: toNumber(input.downloadConcurrency),
    force: input.force,
    dryRun: input.dryRun,
    proxy: input.proxy,
  };
}

function toNumber(value: number | string | undefined): number | undefined {
  if (typeof value === "number") {
    return Number.isNaN(value) ? undefined : value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}
