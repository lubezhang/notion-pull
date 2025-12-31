# notion-pull

一个强大的 CLI 工具,用于将 Notion 笔记递归导出为 Markdown 格式文件,完整保留笔记的层级结构。

## 功能特性

- **递归导出**: 自动导出页面及其所有子页面,保持原有层级结构
- **Markdown 转换**: 使用 `notion-to-md` 将 Notion 页面转换为标准 Markdown 格式
- **智能文件命名**: 自动清理页面标题中的非法字符,生成安全的文件名
- **目录结构映射**: 子页面会创建对应的子目录,保持 Notion 中的组织结构
- **完整的 Notion API 支持**: 支持页面(Page)和数据库(Database)类型

## 安装

项目依赖 Node.js 18+,推荐使用 `pnpm`:

```bash
pnpm install
```

## 快速开始

### 1. 配置环境变量

复制 `.env.example` 为 `.env`,并填写你的 Notion 配置:

```bash
cp .env.example .env
```

编辑 `.env` 文件:

```env
NOTION_API_KEY=your_integration_token_here
NOTION_PAGE_ID=your_page_id_here
```

**如何获取这些信息:**

- **NOTION_API_KEY**:
  1. 访问 https://www.notion.so/my-integrations
  2. 创建新的集成(Integration)
  3. 复制 "Internal Integration Token"

- **NOTION_PAGE_ID**:
  1. 打开你想导出的 Notion 页面
  2. 从浏览器地址栏复制 URL,格式为: `https://notion.so/xxx-<PAGE_ID>?xxx`
  3. 提取其中的 PAGE_ID(32位字符)

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

**参数:**

- `[pageId]` - Notion 页面 ID (可选,如不提供则从 `NOTION_PAGE_ID` 环境变量读取)

**选项:**

- `-o, --output <dir>` - 输出目录 (默认: `./notion-export`)

**示例:**

```bash
# 使用环境变量中的页面 ID,导出到默认目录
notion-pull export

# 指定页面 ID 和输出目录
notion-pull export abc123def456 --output ./my-backup

# 导出到自定义目录
notion-pull export --output ~/Documents/notion-backup
```

## 输出结构示例

假设你的 Notion 结构如下:

```
📄 我的知识库 (根页面)
  ├── 📄 编程笔记
  │   ├── 📄 JavaScript
  │   └── 📄 Python
  ├── 📄 读书笔记
  │   └── 📄 技术类
  └── 📄 工作日志
```

导出后的文件结构:

```
notion-export/
├── 我的知识库.md
└── 我的知识库/
    ├── 编程笔记.md
    ├── 编程笔记/
    │   ├── JavaScript.md
    │   └── Python.md
    ├── 读书笔记.md
    ├── 读书笔记/
    │   └── 技术类.md
    └── 工作日志.md
```

## 开发命令

- `pnpm dev` - 使用 tsx 直接运行源码
- `pnpm build` - 编译 TypeScript 到 `dist/`
- `pnpm start` - 运行编译后的代码
- `pnpm lint` - 运行 ESLint 检查
- `pnpm test` - 运行测试(当前占位)

## 项目结构

```
src/
├── cli.ts              # CLI 入口和命令定义
├── NotionClient.ts     # Notion API 客户端封装
├── NotionToMarkdown.ts # Markdown 转换器
└── NotionExporter.ts   # 导出器主逻辑
```

## 技术栈

- **@notionhq/client** - Notion 官方 API 客户端
- **notion-to-md** - Notion 块转 Markdown 转换器
- **commander** - CLI 框架
- **TypeScript** - 类型安全

## 注意事项

1. **权限设置**: 确保你的 Notion Integration 已被添加到要导出的页面中
   - 打开 Notion 页面
   - 点击右上角的 "···" 菜单
   - 选择 "Add connections"
   - 选择你创建的 Integration

2. **速率限制**: Notion API 有速率限制,导出大量页面时可能需要一些时间

3. **文件名处理**: 特殊字符(如 `<>:"/\|?*`)会被替换为下划线

## 许可证

MIT

