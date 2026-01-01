# notion-pull

[English](./README.md) | 简体中文

一个强大的 CLI 工具，用于将 Notion 笔记递归导出为 Markdown 格式文件，完整保留笔记的层级结构。

## 功能特性

- **递归导出**：自动导出页面及其所有子页面，保持原有层级结构
- **内容隔离**：每个页面的 Markdown 文件只包含该页面自身的内容，不包含子页面内容
- **数据库表格导出**：Notion 数据库自动转换为 Markdown 表格格式，支持多种属性类型
- **媒体文件下载**：可选下载图片和附件文件到本地，并自动替换 Markdown 中的链接
- **智能文件命名**：自动清理页面标题中的非法字符，生成安全的文件名
- **目录结构映射**：子页面会创建对应的子目录，保持 Notion 中的组织结构
- **完整的 Notion API 支持**：支持页面（Page）和数据库（Database）类型

## 安装

项目依赖 Node.js 18+，推荐使用 `pnpm`：

```bash
pnpm install
```

或通过 npm 全局安装：

```bash
npm install -g notion-pull
```

## 快速开始

### 1. 配置环境变量

复制 `.env.example` 为 `.env`，并填写你的 Notion 配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
NOTION_API_KEY=your_integration_token_here
NOTION_PAGE_ID=your_page_id_here
```

**如何获取这些信息：**

- **NOTION_API_KEY**：
  1. 访问 https://www.notion.so/my-integrations
  2. 创建新的集成（Integration）
  3. 复制 "Internal Integration Token"

- **NOTION_PAGE_ID**：
  1. 打开你想导出的 Notion 页面
  2. 从浏览器地址栏复制 URL，格式为：`https://notion.so/xxx-<PAGE_ID>?xxx`
  3. 提取其中的 PAGE_ID（32 位字符）

### 2. 运行导出

```bash
# 使用环境变量中的配置
pnpm dev export

# 或者直接指定页面 ID
pnpm dev export <PAGE_ID>

# 自定义输出目录
pnpm dev export <PAGE_ID> --output ./my-notes

# 或使用构建后的版本
pnpm build
pnpm start export <PAGE_ID>
```

## CLI 命令

### export

导出 Notion 页面及其所有子页面为 Markdown 文件。

```bash
notion-pull export [pageId] [options]
```

**参数：**

- `[pageId]` - Notion 页面 ID（可选，如不提供则从 `NOTION_PAGE_ID` 环境变量读取）

**选项：**

- `-o, --output <dir>` - 输出目录（默认：`./notion-export`）
- `-d, --download-media` - 下载图片和文件到本地（默认：`true`）
- `-a, --attachments-dir <name>` - 附件目录名称（默认：`attachments`）

**示例：**

```bash
# 使用环境变量中的页面 ID，导出到默认目录
notion-pull export

# 指定页面 ID 和输出目录
notion-pull export abc123def456 --output ./my-backup

# 导出并下载所有图片和文件
notion-pull export --download-media

# 导出并下载文件到自定义附件目录
notion-pull export --download-media --attachments-dir media

# 导出到自定义目录
notion-pull export --output ~/Documents/notion-backup
```

## 输出结构示例

### 基本导出（不下载媒体文件）

假设你的 Notion 结构如下：

```
📄 我的知识库（根页面）
  ├── 📄 编程笔记
  │   ├── 📄 JavaScript
  │   └── 📄 Python
  ├── 🗄️ 项目任务（数据库）
  ├── 📄 读书笔记
  │   └── 📄 技术类
  └── 📄 工作日志
```

导出后的文件结构：

```
notion-export/
├── 我的知识库.md
└── 我的知识库/
    ├── 编程笔记.md
    ├── 编程笔记/
    │   ├── JavaScript.md
    │   └── Python.md
    ├── 项目任务.md          # 数据库导出为表格
    ├── 读书笔记.md
    ├── 读书笔记/
    │   └── 技术类.md
    └── 工作日志.md
```

### 数据库表格导出示例

Notion 数据库会被导出为 Markdown 表格。例如，一个任务管理数据库：

**Notion 中的数据库：**
- 任务名称（Title）
- 状态（Select：待办 / 进行中 / 已完成）
- 优先级（Select：高 / 中 / 低）
- 截止日期（Date）

**导出的 `项目任务.md` 文件：**

```markdown
# 项目任务

| 任务名称 | 状态 | 优先级 | 截止日期 |
| --- | --- | --- | --- |
| 完成项目文档 | 进行中 | 高 | 2025-01-15 |
| 代码审查 | 待办 | 中 | 2025-01-10 |
| 部署到生产环境 | 已完成 | 高 | 2025-01-05 |
```

**支持的数据库属性类型：**
- Title（标题）、Rich Text（富文本）、Number（数字）
- Select（单选）、Multi-select（多选）、Status（状态）
- Date（日期）、Checkbox（复选框）
- URL（链接）、Email（邮箱）、Phone Number（电话）
- People（人员）、Files（文件）
- Created Time（创建时间）、Last Edited Time（最后编辑时间）

**数据库条目的详细内容：**

如果数据库条目包含额外的内容块或子页面，会创建 `{数据库名}_详情/` 目录：

```
notion-export/
└── 我的知识库/
    ├── 项目任务.md              # 表格汇总
    └── 项目任务_详情/            # 条目详细内容
        ├── 完成项目文档.md
        └── 部署到生产环境.md
```

### 启用媒体文件下载后的结构

使用 `--download-media` 选项时：

```
notion-export/
├── 我的知识库.md
└── 我的知识库/
    ├── attachments/           # 媒体文件目录
    │   ├── image1_1234567.png
    │   ├── diagram_1234568.jpg
    │   └── document_1234569.pdf
    ├── 编程笔记.md
    ├── 编程笔记/
    │   ├── attachments/       # 每个目录都有独立的附件文件夹
    │   │   └── code_1234570.png
    │   ├── JavaScript.md
    │   └── Python.md
    ├── 读书笔记.md
    ├── 读书笔记/
    │   └── 技术类.md
    └── 工作日志.md
```

**说明：**
- 图片和文件会下载到每个笔记所在目录的 `attachments/` 子目录
- Markdown 文件中的链接会自动替换为相对路径，如：`![图片](attachments/image_1234567.png)`
- 支持的文件类型包括：图片（PNG、JPG 等）、PDF、Office 文档、压缩包、音视频等

## 开发命令

- `pnpm dev` - 使用 tsx 直接运行源码
- `pnpm build` - 编译 TypeScript 到 `dist/`
- `pnpm start` - 运行编译后的代码
- `pnpm lint` - 运行 ESLint 检查
- `pnpm test` - 运行测试（当前占位）

## 项目结构

```
src/
├── cli.ts                # CLI 入口和命令定义
├── NotionClient.ts       # Notion API 客户端封装
├── NotionToMarkdown.ts   # Markdown 转换器
├── NotionExporter.ts     # 导出器主逻辑
├── DatabaseToMarkdown.ts # 数据库转 Markdown 表格转换器
└── FileDownloader.ts     # 文件下载管理器
```

## 技术栈

- **@notionhq/client** - Notion 官方 API 客户端
- **notion-to-md** - Notion 块转 Markdown 转换器
- **commander** - CLI 框架
- **undici** - 高性能 HTTP 客户端（用于文件下载）
- **TypeScript** - 类型安全

## 注意事项

1. **权限设置**：确保你的 Notion Integration 已被添加到要导出的页面中
   - 打开 Notion 页面
   - 点击右上角的 "···" 菜单
   - 选择 "Add connections"
   - 选择你创建的 Integration

2. **速率限制**：Notion API 有速率限制，导出大量页面时可能需要一些时间

3. **文件名处理**：特殊字符（如 `<>:"/\|?*`）会被替换为下划线

4. **媒体文件下载**：
   - Notion 中的图片和文件 URL 有时效性，建议使用 `--download-media` 选项将其保存到本地
   - 下载失败的文件会在日志中标记，但不会中断导出流程
   - 文件名会添加时间戳后缀以避免冲突
   - 支持的文件类型：PDF、DOC、DOCX、XLS、XLSX、PPT、PPTX、ZIP、RAR、7Z、TAR、GZ、MP4、AVI、MOV、MP3、WAV、TXT、CSV、JSON、XML 等

## 许可证

MIT
