# Notion 全量导出工具设计说明

## 总体架构
工具由四个主要层组成：
1. **接口层（CLI）**：解析命令行参数、加载配置文件或环境变量，负责启动导出流程并输出运行结果。
2. **应用层（Export Orchestrator）**：协调页面遍历、Markdown 转换、资源下载与写入，处理错误重试与限流控制。
3. **领域层（Page Processor）**：封装 Notion 数据模型到内部表示的转换逻辑，分别负责块处理、数据库导出、文件命名等复杂规则。
4. **基础层（Infrastructure）**：与 Notion API、文件系统、日志及缓存打交道。

```
CLI -> Orchestrator -> Page Processor -> (Markdown Renderer, Asset Downloader, Output Writer)
                                    -> Notion API Client
```

## 核心模块

### 1. CLI (`src/cli.ts`)
- 使用 `commander` 或 `yargs` 解析参数。
- 支持的主要参数：
  - `--token`：Notion 集成 Token，默认读取环境变量。
  - `--root`：根页面 ID。
  - `--out-dir`：输出目录，默认 `./export`.
  - `--concurrency`：API 并发度，默认 `4`。
  - `--force`：是否强制覆盖已有文件。
  - `--dry-run`：仅打印将要导出的页面，不执行写入。
- 负责构建 `ExportConfig` 对象传递给 Orchestrator。

### 2. 配置与依赖注入 (`src/config.ts`)
- 统一加载环境变量、CLI 参数与可选的配置文件（如 `notion-export.config.json`）。
- 定义 `ExportConfig` 接口，包括输出路径、并发度、缓存策略等。
- 提供校验逻辑，确保必填项存在，并输出合理默认值。

### 3. Notion API 客户端 (`src/notion/client.ts`)
- 基于 `@notionhq/client` 封装：
  - 页面检索（search / list）、数据库分页、块分页等。
  - 针对 API 限流的重试策略（指数退避，最多重试 3 次）。
  - 将原始响应转换为内部统一的 `NotionBlock`、`NotionPage` 类型。
- 可选：提供简单的缓存层，减少重复请求。

### 4. 页面遍历器 (`src/notion/traversal.ts`)
- 从根页面开始使用 BFS/DFS 深度遍历。
- 输出扁平化的页面队列，保留层级关系（如 `parentId`、`pathSegments`）。
- 负责按照 `concurrency` 参数控制请求速率（例如使用 `p-limit`）。

### 5. Markdown 渲染引擎 (`src/markdown/renderer.ts`)
- 将 Notion Block 转换为 Markdown 字符串。
- 推荐使用 `notion-to-md` 或自定义渲染器：
  - 若引入第三方库，需扩展以支持图片路径重写。
  - 自研方案时，按 Block 类型定义渲染函数表，确保支持标题、列表、引用、代码、公式、切换、待办、Callout 等。
- 提供钩子处理数据库块，可配置为：
  - 导出为独立 Markdown 文件（如 `数据库名.md`）。
  - 在父页面生成 Markdown 表格（默认策略）。

### 6. 资源下载器 (`src/assets/downloader.ts`)
- 针对每个带文件的 Block（image、file、pdf、video 等），根据源 URL 下载到本地。
- 使用 `node-fetch` 或 `axios`（注意带上 `notion-client` 提供的临时签名 URL）。
- 处理文件名冲突与非法字符，生成相对路径 `./img/<sanitized-name>`.
- 可配置最大并发，避免过多并行下载。

### 7. 输出管理器 (`src/output/writer.ts`)
- 根据页面路径创建文件夹结构。
- 写入 Markdown 文件及资源文件。
- 根据配置处理已存在文件（覆盖、跳过或比较 hash）。
- 支持记录导出报告（JSON + 终端汇总）。

### 8. 日志与追踪 (`src/logger.ts`)
- 使用 `pino` 或 `winston` 提供分级日志。
- 控制在终端输出简洁信息，并可选写入日志文件。

## 数据模型
- `ExportConfig`：承载所有运行参数。
- `PageNode`：
  - `id`, `title`, `parentId`, `breadcrumb`, `blocks`.
- `MarkdownArtifact`：
  - `content`: string
  - `assets`: `{originalUrl, localPath, type}`
- `ExportResult`：
  - `pageId`, `status` (`success|skipped|failed`), `message`, `duration`.

## 流程设计
1. CLI 解析参数，创建 `ExportConfig`。
2. Orchestrator 初始化 Notion Client、遍历器、渲染器、下载器等依赖。
3. 遍历器拉取根页面及其子页面列表，构造导出队列。
4. 对每个页面执行：
   - 拉取块内容与数据库条目。
   - 渲染为 Markdown（阶段性产出中间结构）。
   - 下载并重写资源链接。
   - 调用输出管理器写入文件。
5. Orchestrator 汇总结果并输出。

## 错误与重试策略
- 将网络错误、限流、临时 5xx 视为可重试，使用指数退避（500ms 起，每次翻倍，最多 3 次）。
- 对于不可恢复错误（权限不足、配置缺失），记录失败原因并继续处理其它页面。
- 在最终报告中列出失败页面列表。

## 并发与性能
- 使用 `p-limit` 控制同时在处理的页面数量。
- 下载资源时可设置独立的 `downloadConcurrency`。
- 对于大型数据库分页，从 API 分页中逐批拉取，边处理边写入以降低内存占用。

## 配置与扩展性
- 支持加载 `notion-export.config.json`，允许默认配置持久化。
- 设计 `MarkdownRenderer` 与 `AssetDownloader` 为可替换实现，未来可扩展导出 HTML 或 PDF。
- 通过事件或钩子机制（如 `events` 模块）对导出过程插入自定义逻辑（例如过滤页面）。

## 测试策略
- **单元测试**：对 Markdown 渲染、文件命名、资源路径重写等纯函数进行测试。
- **集成测试**：使用 Notion Mock 或录制的响应数据验证整体流程。
- **端到端测试**（可选）：用真实 Notion 测试空间验证主要用例（需避免在 CI 中运行）。

## 开发计划（高层）
1. 初始化项目结构，配置 TypeScript、ESLint、Prettier。
2. 实现配置加载与 CLI。
3. 封装 Notion API 客户端与遍历器。
4. 完成 Markdown 渲染及资源下载模块。
5. 实现输出管理与日志汇总。
6. 编写 README、测试用例与示例配置。

## 关键风险
- Notion API 权限限制：需确保文档说明如何配置集成并授权根页面。
- 数据库导出的 Markdown 表达可能复杂，需要明确格式规范。
- 大规模工作区导出时可能触发 API 限流或耗时过长，需提供进度提示。
