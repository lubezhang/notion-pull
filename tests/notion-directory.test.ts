import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@notionhq/client";

test("list Notion pages for configured workspace", async () => {
    const token = '';
    assert.ok(token, "请先设置 NOTION_TOKEN 环境变量");

    const notion = new Client({ auth: token });
    const rootPageId = '';

    try {
        if (rootPageId) {
            const formattedRoot = formatId(rootPageId);
            // console.log("formattedRoot:", formattedRoot);
            const rootPage = await notion.pages.retrieve({ page_id: formattedRoot });
            // console.log('rootPage:', JSON.stringify(rootPage, null, 2))
            const title = extractTitle(rootPage) ?? "(未命名页面)";
            console.info("根页面:", { id: formattedRoot, title });

            const children = await notion.blocks.children.list({
                block_id: formattedRoot,
                page_size: 100,
            });
            console.log('children:', JSON.stringify(children, null, 2))

            const childPages = (children.results as Array<Record<string, unknown>>)
                .filter((item) => item.object === "block" && item.type === "child_page")
                .map((item) => {
                    const child = item.child_page as { title?: string } | undefined;
                    return {
                        id: (item.id as string | undefined) ?? "",
                        title: child?.title ?? "(未命名子页面)",
                    };
                });

            console.info("子页面列表:", childPages);
            assert.ok(childPages.length >= 0);
        } else {
            const search = await notion.search({
                filter: { property: "object", value: "page" },
                page_size: 10,
            });

            const pages = (search.results as Array<Record<string, unknown>>)
                .filter((item) => item.object === "page")
                .map((item) => {
                    const id = typeof item.id === "string" ? item.id : "";
                    return {
                        id,
                        title: extractTitle(item) ?? "(未命名页面)",
                    };
                });

            console.info("可访问页面:", pages);
            assert.ok(pages.length >= 0);
        }
    } catch (error) {
        console.log('notion err:', error)
    }
});

function formatId(id: string): string {
    const cleaned = id.replace(/-/g, "");
    if (cleaned.length !== 32) {
        return id;
    }
    return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
}

function extractTitle(page: unknown): string | undefined {
    if (!page || typeof page !== "object") {
        return undefined;
    }
    const properties = (page as { properties?: Record<string, unknown> }).properties;
    if (!properties) {
        return undefined;
    }

    for (const property of Object.values(properties)) {
        if (!property || typeof property !== "object") {
            continue;
        }
        if ((property as { type?: string }).type === "title") {
            const title = (property as { title?: Array<{ plain_text?: string }> }).title ?? [];
            return title.map((item) => item.plain_text ?? "").join("");
        }
    }

    return undefined;
}
