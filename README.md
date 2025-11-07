# notion-pull

最初的目标是导出 Notion 页面，目前版本聚焦于“读取 Notion 的页面层级并在本地创建对应的目录结构”，方便后续的 Markdown 渲染或笔记同步流程接入。

## 功能特性
- 基于 `@notionhq/client` 遍历根页面的子页面结构，保留原有层级。
- 自动清洗页面标题中的非法字符，生成可用的目录名称。
- 优先创建与根页面同名的根目录，所有内容都写入该目录下。
- Dry Run 模式可在 CI 中预览将要创建的目录列表。
- CLI、环境变量与 JSON 配置文件可灵活组合。

## 安装
项目依赖 Node.js 18+，推荐使用 `pnpm`：

```bash
pnpm install
```

## 快速开始
```bash
# Dry Run：打印目录计划
pnpm dev -- --token $NOTION_TOKEN --root <根页面ID> --dry-run

# 创建真实目录
pnpm dev -- --token $NOTION_TOKEN --root <根页面ID> --out-dir ./backup

# 限制遍历深度（仅同步两级子页面）
pnpm dev -- --token $NOTION_TOKEN --root <根页面ID> --max-depth 2
```

## CLI 参数
| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `--token, -t` | Notion 集成 Token，默认读取 `NOTION_TOKEN` | - |
| `--root, -r` | 根页面 ID，可从浏览器地址栏复制 | - |
| `--out-dir, -o` | 输出目录，支持相对路径 | `./export` |
| `--max-depth` | 遍历子页面最大层级，默认不限 | - |
| `--dry-run` | 仅打印计划不创建 | `false` |
| `--config` | JSON 配置文件路径 | - |

## 配置文件示例

```json
{
    "token": "secret_xxx",
    "rootPageId": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "outDir": "./backup",
    "dryRun": false,
    "maxDepth": 2
}
```

## 开发命令
- `pnpm dev`：通过 `tsx` 直接执行源码。
- `pnpm build`：使用 TypeScript 编译到 `dist/`。
- `pnpm lint`：运行 ESLint。
- `pnpm test`：当前占位。

## 主要目录
- `src/cli.ts`：命令行入口与参数解析。
- `src/index.ts`：目录创建流程。
- `src/config.ts`：配置合并与校验。
- `src/notion/`：封装所有 Notion 访问与目录规划逻辑。
- `src/directory.ts`：本地目录创建工具。
- `docs/`：原有的需求与设计记录。

## 许可证

MIT
