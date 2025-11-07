import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createOutputWriter } from "../writer";
import type { PageNode } from "../../types";
import type { Logger } from "../../logger";

const noopLogger = {
    info: () => {},
    debug: () => {},
    error: () => {},
} as unknown as Logger;

test("顶层页面会创建同名目录", async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), "notion-pull-writer-"));
    const writer = createOutputWriter({
        baseDir,
        dryRun: false,
        force: true,
        logger: noopLogger,
    });

    const page: PageNode = {
        id: "page-top",
        title: "Top Level Page",
        path: [],
        type: "page",
        hasChildPages: true,
        page: { id: "page-top" },
        blocks: [],
    };

    await writer.writePage({
        page,
        markdown: { content: "# Hello", assets: [] },
        assets: [],
    });

    const expectedDir = path.join(baseDir, "Top Level Page");
    const expectedFile = path.join(expectedDir, "Top Level Page.md");
    const dirStat = await stat(expectedDir);
    assert.ok(dirStat.isDirectory());

    const content = await readFile(expectedFile, "utf8");
    assert.strictEqual(content, "# Hello");
});

test("子页面保持原有层级", async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), "notion-pull-writer-"));
    const writer = createOutputWriter({
        baseDir,
        dryRun: false,
        force: true,
        logger: noopLogger,
    });

    const page: PageNode = {
        id: "child-page",
        title: "Child Page",
        path: ["Parent Page"],
        type: "page",
        hasChildPages: false,
        page: { id: "child-page" },
        blocks: [],
    };

    await writer.writePage({
        page,
        markdown: { content: "# Child", assets: [] },
        assets: [],
    });

    const expectedDir = path.join(baseDir, "Parent Page");
    const expectedFile = path.join(expectedDir, "Child Page.md");
    const content = await readFile(expectedFile, "utf8");
    assert.strictEqual(content, "# Child");

    await assert.rejects(stat(path.join(expectedDir, "Child Page")));
});

test("包含子页面的页面会生成独立目录", async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), "notion-pull-writer-"));
    const writer = createOutputWriter({
        baseDir,
        dryRun: false,
        force: true,
        logger: noopLogger,
    });

    const page: PageNode = {
        id: "parent-page",
        title: "Parent Page",
        path: ["Root Page"],
        type: "page",
        hasChildPages: true,
        page: { id: "parent-page" },
        blocks: [],
    };

    await writer.writePage({
        page,
        markdown: { content: "# Parent", assets: [] },
        assets: [],
    });

    const expectedDir = path.join(baseDir, "Root Page", "Parent Page");
    const expectedFile = path.join(expectedDir, "Parent Page.md");
    const dirStat = await stat(expectedDir);
    assert.ok(dirStat.isDirectory());
    const content = await readFile(expectedFile, "utf8");
    assert.strictEqual(content, "# Parent");
});
