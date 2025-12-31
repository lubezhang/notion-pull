import type { Client } from "@notionhq/client";
import type {
    DataSourceObjectResponse,
    PageObjectResponse,
} from "@notionhq/client/build/src/api-endpoints";

/**
 * 数据库转 Markdown 表格转换器
 */
export default class DatabaseToMarkdown {
    private notion: Client;

    constructor(notion: Client) {
        this.notion = notion;
    }

    /**
     * 将数据库转换为 Markdown 表格
     * @param dataSource - 数据源对象
     * @param pages - 数据库中的页面列表
     * @returns Markdown 表格字符串
     */
    public databaseToMarkdownTable(
        dataSource: DataSourceObjectResponse,
        pages: PageObjectResponse[]
    ): string {
        if (pages.length === 0) {
            return "*(数据库为空)*\n";
        }

        // 提取数据库属性(列)
        const properties = dataSource.properties;
        const propertyKeys = Object.keys(properties);

        // 构建表头
        const headers = propertyKeys.map(key => this.escapeMarkdown(key));
        const headerRow = `| ${headers.join(" | ")} |`;
        const separatorRow = `| ${headers.map(() => "---").join(" | ")} |`;

        // 构建数据行
        const dataRows = pages.map(page => {
            const cells = propertyKeys.map(key => {
                const property = page.properties[key];
                return this.formatProperty(property);
            });
            return `| ${cells.join(" | ")} |`;
        });

        // 组合表格
        const table = [
            headerRow,
            separatorRow,
            ...dataRows,
        ].join("\n");

        return `${table}\n`;
    }

    /**
     * 格式化属性值为 Markdown 单元格内容
     */
    private formatProperty(property: any): string {
        if (!property) return "";

        try {
            switch (property.type) {
                case "title":
                    return this.formatRichText(property.title);

                case "rich_text":
                    return this.formatRichText(property.rich_text);

                case "number":
                    return property.number !== null ? String(property.number) : "";

                case "select":
                    return property.select?.name || "";

                case "multi_select":
                    return property.multi_select?.map((s: any) => s.name).join(", ") || "";

                case "date":
                    if (!property.date) return "";
                    if (property.date.end) {
                        return `${property.date.start} → ${property.date.end}`;
                    }
                    return property.date.start;

                case "checkbox":
                    return property.checkbox ? "☑" : "☐";

                case "url":
                    return property.url ? `[链接](${property.url})` : "";

                case "email":
                    return property.email || "";

                case "phone_number":
                    return property.phone_number || "";

                case "status":
                    return property.status?.name || "";

                case "people":
                    return property.people?.map((p: any) => p.name || "Unknown").join(", ") || "";

                case "files":
                    return property.files?.map((f: any) => {
                        const name = f.name || "file";
                        if (f.type === "external") {
                            return `[${name}](${f.external.url})`;
                        } else if (f.type === "file") {
                            return `[${name}](${f.file.url})`;
                        }
                        return name;
                    }).join(", ") || "";

                case "created_time":
                    return property.created_time || "";

                case "created_by":
                    return property.created_by?.name || "";

                case "last_edited_time":
                    return property.last_edited_time || "";

                case "last_edited_by":
                    return property.last_edited_by?.name || "";

                case "formula":
                    return this.formatFormula(property.formula);

                case "relation":
                    return property.relation?.length > 0 ? `${property.relation.length} 项` : "";

                case "rollup":
                    return this.formatRollup(property.rollup);

                default:
                    return "";
            }
        } catch (error) {
            console.error(`格式化属性失败 (${property.type}):`, error);
            return "";
        }
    }

    /**
     * 格式化富文本
     */
    private formatRichText(richText: any[]): string {
        if (!richText || richText.length === 0) return "";

        return richText
            .map(text => {
                if (!text.plain_text) return "";

                let content = this.escapeMarkdown(text.plain_text);

                // 应用格式
                if (text.annotations) {
                    if (text.annotations.bold) content = `**${content}**`;
                    if (text.annotations.italic) content = `*${content}*`;
                    if (text.annotations.strikethrough) content = `~~${content}~~`;
                    if (text.annotations.code) content = `\`${content}\``;
                }

                // 处理链接
                if (text.href) {
                    content = `[${content}](${text.href})`;
                }

                return content;
            })
            .join("");
    }

    /**
     * 格式化公式结果
     */
    private formatFormula(formula: any): string {
        if (!formula) return "";

        switch (formula.type) {
            case "string":
                return formula.string || "";
            case "number":
                return formula.number !== null ? String(formula.number) : "";
            case "boolean":
                return formula.boolean ? "Yes" : "No";
            case "date":
                if (!formula.date) return "";
                if (formula.date.end) {
                    return `${formula.date.start} → ${formula.date.end}`;
                }
                return formula.date.start;
            default:
                return "";
        }
    }

    /**
     * 格式化 Rollup 结果
     */
    private formatRollup(rollup: any): string {
        if (!rollup) return "";

        switch (rollup.type) {
            case "number":
                return rollup.number !== null ? String(rollup.number) : "";
            case "date":
                if (!rollup.date) return "";
                if (rollup.date.end) {
                    return `${rollup.date.start} → ${rollup.date.end}`;
                }
                return rollup.date.start;
            case "array":
                return rollup.array?.length > 0 ? `${rollup.array.length} 项` : "";
            default:
                return "";
        }
    }

    /**
     * 转义 Markdown 特殊字符(用于表格单元格)
     */
    private escapeMarkdown(text: string): string {
        return text
            .replace(/\|/g, "\\|")  // 转义管道符
            .replace(/\n/g, " ")    // 换行符替换为空格
            .replace(/\r/g, "")     // 移除回车符
            .trim();
    }
}
