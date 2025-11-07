# notion-pull

基于 Node.js 的命令行工具，用于将 Notion 工作区内容批量导出为 Markdown，并同时下载页面中的媒体资源，便于本地备份或纳入版本控制。

## 功能特性
- 支持通过 Notion 官方 API 遍历根页面及其子页面，保留层级结构。
- 将常见块类型（标题、段落、列表、引用、代码、Callout、切换、数据库等）转换为 Markdown。
- 自动整理图片、文件、音视频等资源到页面同级的 `img/` 目录，并重写 Markdown 引用路径。
- 提供并发控制、重试策略、覆盖策略、Dry Run 等运行选项。
- CLI、环境变量与可选 JSON 配置文件三种方式合并加载配置。

## 安装
项目依赖 Node.js 18 LTS 及以上版本，包管理器推荐 `pnpm`。

```bash
pnpm install
```

## 快速开始
1. 在 Notion 中创建集成并获取 Token，确保该集成已被授权访问需要导出的页面。
2. 将 Token 写入环境变量（请使用你自己的令牌值，不要在仓库中提交真实令牌）：
   ```bash
   export NOTION_TOKEN="<YOUR_NOTION_TOKEN>"
   ```
3. 运行导出命令（默认输出到 `./export`）：
   ```bash
   pnpm dev -- --dry-run
   pnpm dev -- --root "<根页面ID>" --out-dir "./backup"
   ```

> 使用 `pnpm dev` 会通过 `tsx` 直接运行源码；构建后也可通过 `node ./dist/cli.js` 或 `npx notion-pull` 执行。

## CLI 参数
| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `--token, -t` | Notion 集成 Token，优先级高于环境变量 | - |
| `--root, -r` | 指定根页面 ID，留空时尝试遍历集成可访问的顶层页面 | - |
| `--out-dir, -o` | 导出目录路径 | `./export` |
| `--concurrency, -c` | 页面处理最大并发数 | `4` |
| `--download-concurrency` | 媒体下载最大并发数 | `4` |
| `--force` | 写入文件时覆盖已存在内容 | `false` |
| `--dry-run` | 仅打印即将处理的页面，不落盘 | `false` |
| `--proxy` | 指定访问 Notion API 的 HTTP/HTTPS 代理地址 | 环境变量 `NOTION_PROXY` / `HTTPS_PROXY` |
| `--config` | 指定 JSON 配置文件路径 | - |

任何 CLI 选项都可在配置文件或环境变量中覆盖，并在最终运行参数中按照 “CLI > 配置文件 > 环境变量 > 默认值” 的优先级合并。

## 配置文件
通过 `--config notion-export.config.json` 指定配置文件，字段需要使用 `ExportConfig` 约定的键名：

```json
{
    "token": "<YOUR_NOTION_TOKEN>",
    "rootPageId": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "outDir": "./export",
    "concurrency": 6,
    "downloadConcurrency": 6,
    "force": false,
    "dryRun": false,
    "proxy": "http://127.0.0.1:7890"
}
```

配置文件通常用于持久化默认输出目录、并发度等参数，敏感信息建议仍通过环境变量或命令行传入。

## 示例
```bash
# 导出根页面及其子页面（建议通过环境变量传入令牌）
pnpm dev -- -t "$NOTION_TOKEN" --root <pageId> --out-dir "./backup"

```


## 输出结构
- 页面层级会映射到文件夹层级，Markdown 文件名来源于页面标题（会自动剔除非法字符、转为小写并用连字符替换空格）。
- 含子页面或顶层的页面会拥有同名文件夹，方便在其目录下继续存放子页面；叶子页面则直接写在父目录中。
- 每个页面的资源存放在同级目录的 `img/` 文件夹内，Markdown 中引用采用相对路径（如 `./img/image.png`）。
- 执行 Dry Run 时会输出将要写入的文件路径，但不会创建任何文件。

## 日志与重试
- 默认使用 `pino` 输出结构化日志，可通过 `LOG_LEVEL` 环境变量调整日志级别。
- 针对 Notion API 限流或 5xx 错误会进行最多 3 次指数退避重试。
- 下载资源失败时会记录警告日志并继续处理其它页面。

## 开发命令
- `pnpm dev`：运行 CLI（通过 `tsx`）进行本地调试。
- `pnpm build`：编译 TypeScript 并修复输出中的导入路径。
- `pnpm lint`：使用 ESLint（Flat Config）检查代码质量。
- `pnpm test`：当前为占位指令，尚未接入实际测试框架。

## 主要目录
- `src/cli.ts`：命令行入口与参数解析。
- `src/index.ts`：导出流程编排（遍历、渲染、下载、写出）。
- `src/config.ts`：配置加载与参数归一化。
- `src/notion/`：Notion API 封装与页面遍历。
- `src/markdown/`：Notion 块到 Markdown 的转换逻辑。
- `src/assets/`：媒体下载器。
- `src/output/`：输出目录管理与文件写入。
- `docs/`：需求与设计文档。

## 已知限制
- 根页面自动发现依赖 Notion 搜索接口，可能包含非顶层页面，必要时请显式传入 `--root`。
- 增量导出目前仅依赖跳过已存在文件，未比较内容差异，建议配合 `--force` 或版本控制判断更新。
- 输出目录暂不支持“合并为单层目录”模式，如有需求可在 `src/output/writer.ts` 中扩展。
- 尚未提供正式的测试套件，建议在接入真实工作区前使用 Dry Run 验证页面列表。

## 许可证

MIT
