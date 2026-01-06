# notion-pull

English | [简体中文](./README.zh-CN.md)

A powerful CLI tool for recursively exporting Notion pages to Markdown format while preserving the complete hierarchical structure.

## Features

- **Recursive Export**: Automatically exports pages and all their subpages, maintaining the original hierarchy
- **Content Isolation**: Each page's Markdown file contains only its own content, excluding child page content
- **Database Table Export**: Notion databases are automatically converted to Markdown table format with support for multiple property types
- **Media Download**: Optionally download images and attachments locally with automatic link replacement in Markdown
- **Smart File Naming**: Automatically sanitizes page titles by removing invalid characters to generate safe filenames
- **Directory Structure Mapping**: Subpages create corresponding subdirectories, preserving Notion's organizational structure
- **Full Notion API Support**: Supports both Page and Database block types
- **Robust Pagination**: Handles large databases and page lists with automatic pagination to ensure no data is lost

## Installation

Requires Node.js 18+. Using `pnpm` is recommended:

```bash
pnpm install
```

Or install globally via npm:

```bash
npm install -g notion-pull
```

## Quick Start

### 1. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your Notion configuration:

```bash
cp .env.example .env
```

Edit the `.env` file:

```env
NOTION_API_KEY=your_integration_token_here
NOTION_PAGE_ID=your_page_id_here
```

**How to obtain these values:**

- **NOTION_API_KEY**:
  1. Visit https://www.notion.so/my-integrations
  2. Create a new Integration
  3. Copy the "Internal Integration Token"

- **NOTION_PAGE_ID**:
  1. Open the Notion page you want to export
  2. Copy the URL from the browser address bar: `https://notion.so/xxx-<PAGE_ID>?xxx`
  3. Extract the PAGE_ID (32 characters)

### 2. Run Export

```bash
# Use configuration from environment variables
pnpm dev export

# Or specify a page ID directly
pnpm dev export <PAGE_ID>

# Custom output directory
pnpm dev export <PAGE_ID> --output ./my-notes

# Or use the built version
pnpm build
pnpm start export <PAGE_ID>
```

## CLI Commands

### export

Exports a Notion page and all its subpages to Markdown files.

```bash
notion-pull export [pageId] [options]
```

**Arguments:**

- `[pageId]` - Notion page ID (optional; if not provided, reads from `NOTION_PAGE_ID` environment variable)

**Options:**

- `-o, --output <dir>` - Output directory (default: `./notion-export`)
- `-d, --download-media` - Download images and files locally (default: `true`)
- `-a, --attachments-dir <name>` - Attachments directory name (default: `attachments`)

**Examples:**

```bash
# Use page ID from environment variable, export to default directory
notion-pull export

# Specify page ID and output directory
notion-pull export abc123def456 --output ./my-backup

# Export and download all images and files
notion-pull export --download-media

# Export and download files to a custom attachments directory
notion-pull export --download-media --attachments-dir media

# Export to a custom directory
notion-pull export --output ~/Documents/notion-backup
```

## Output Structure Examples

### Basic Export (Without Media Download)

Given a Notion structure like:

```
📄 My Knowledge Base (root page)
  ├── 📄 Programming Notes
  │   ├── 📄 JavaScript
  │   └── 📄 Python
  ├── 🗄️ Project Tasks (database)
  ├── 📄 Reading Notes
  │   └── 📄 Technical Books
  └── 📄 Work Log
```

The exported file structure:

```
notion-export/
├── My Knowledge Base.md
└── My Knowledge Base/
    ├── Programming Notes.md
    ├── Programming Notes/
    │   ├── JavaScript.md
    │   └── Python.md
    ├── Project Tasks.md          # Database exported as table
    ├── Reading Notes.md
    ├── Reading Notes/
    │   └── Technical Books.md
    └── Work Log.md
```

### Database Table Export Example

Notion databases are exported as Markdown tables. For example, a task management database:

**Database in Notion:**
- Task Name (Title)
- Status (Select: To Do / In Progress / Completed)
- Priority (Select: High / Medium / Low)
- Due Date (Date)

**Exported `Project Tasks.md` file:**

```markdown
# Project Tasks

| Task Name | Status | Priority | Due Date |
| --- | --- | --- | --- |
| Complete project docs | In Progress | High | 2025-01-15 |
| Code review | To Do | Medium | 2025-01-10 |
| Deploy to production | Completed | High | 2025-01-05 |
```

**Supported Database Property Types:**
- Title, Rich Text, Number
- Select, Multi-select, Status
- Date, Checkbox
- URL, Email, Phone Number
- People, Files
- Created Time, Last Edited Time

**Database Entry Details:**

If database entries contain additional content blocks or subpages, a `{DatabaseName}_details/` directory is created:

```
notion-export/
└── My Knowledge Base/
    ├── Project Tasks.md              # Table summary
    └── Project Tasks_details/        # Entry details
        ├── Complete project docs.md
        └── Deploy to production.md
```

### With Media Download Enabled

Using the `--download-media` option:

```
notion-export/
├── My Knowledge Base.md
└── My Knowledge Base/
    ├── attachments/           # Media files directory
    │   ├── image1_1234567.png
    │   ├── diagram_1234568.jpg
    │   └── document_1234569.pdf
    ├── Programming Notes.md
    ├── Programming Notes/
    │   ├── attachments/       # Each directory has its own attachments folder
    │   │   └── code_1234570.png
    │   ├── JavaScript.md
    │   └── Python.md
    ├── Reading Notes.md
    ├── Reading Notes/
    │   └── Technical Books.md
    └── Work Log.md
```

**Notes:**
- Images and files are downloaded to an `attachments/` subdirectory within each page's directory
- Links in Markdown files are automatically replaced with relative paths, e.g., `![Image](attachments/image_1234567.png)`
- Supported file types include: images (PNG, JPG, etc.), PDF, Office documents, archives, audio/video, and more

## Development Commands

- `pnpm dev` - Run source code directly with tsx
- `pnpm build` - Compile TypeScript to `dist/`
- `pnpm start` - Run compiled code
- `pnpm lint` - Run ESLint checks
- `pnpm test` - Run tests (placeholder)

## Project Structure

```
src/
├── cli.ts                # CLI entry point and command definitions
├── NotionClient.ts       # Notion API client wrapper
├── NotionToMarkdown.ts   # Markdown converter
├── NotionExporter.ts     # Main export logic
├── DatabaseToMarkdown.ts # Database to Markdown table converter
└── FileDownloader.ts     # File download manager
```

## Tech Stack

- **@notionhq/client** - Official Notion API client
- **notion-to-md** - Notion blocks to Markdown converter
- **commander** - CLI framework
- **undici** - High-performance HTTP client (for file downloads)
- **TypeScript** - Type safety

## Important Notes

1. **Permission Setup**: Ensure your Notion Integration has been added to the pages you want to export
   - Open the Notion page
   - Click the "···" menu in the top right
   - Select "Add connections"
   - Choose your created Integration

2. **Rate Limiting**: The Notion API has rate limits; exporting many pages may take some time

3. **Filename Handling**: Special characters (such as `<>:"/\|?*`) are replaced with underscores

4. **Media File Download**:
   - Image and file URLs in Notion have expiration times; use `--download-media` to save them locally
   - Failed downloads are logged but don't interrupt the export process
   - Filenames include timestamp suffixes to avoid conflicts
   - Supported file types: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, ZIP, RAR, 7Z, TAR, GZ, MP4, AVI, MOV, MP3, WAV, TXT, CSV, JSON, XML, etc.

## License

MIT
