import { mkdir, writeFile } from "fs/promises";
import { join, extname } from "path";
import { fetch } from "undici";

export interface DownloadedFile {
    originalUrl: string;
    localPath: string;
    relativePath: string;
}

/**
 * 文件下载管理器 - 负责下载 Notion 中的图片和附件
 */
export default class FileDownloader {
    private downloadedFiles: Map<string, DownloadedFile> = new Map();

    /**
     * 下载文件到指定目录
     * @param url - 文件的原始 URL
     * @param baseDir - 页面所在的基础目录
     * @param attachmentsDir - 附件子目录名称（默认为 "attachments"）
     * @returns 下载后的文件信息
     */
    public async downloadFile(
        url: string,
        baseDir: string,
        attachmentsDir: string = "attachments"
    ): Promise<DownloadedFile> {
        // 如果已经下载过，直接返回
        if (this.downloadedFiles.has(url)) {
            return this.downloadedFiles.get(url)!;
        }

        try {
            // 创建 attachments 目录
            const attachmentsDirPath = join(baseDir, attachmentsDir);
            await mkdir(attachmentsDirPath, { recursive: true });

            // 提取文件名
            const fileName = this.extractFileName(url);
            const filePath = join(attachmentsDirPath, fileName);
            const relativePath = join(attachmentsDir, fileName);

            // 下载文件
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`下载失败: ${response.status} ${response.statusText}`);
            }

            const buffer = await response.arrayBuffer();
            await writeFile(filePath, Buffer.from(buffer));

            const downloadedFile: DownloadedFile = {
                originalUrl: url,
                localPath: filePath,
                relativePath: relativePath,
            };

            // 记录下载信息
            this.downloadedFiles.set(url, downloadedFile);

            return downloadedFile;
        } catch (error) {
            console.error(`  ⚠️  文件下载失败 (${url}):`, error instanceof Error ? error.message : String(error));
            throw error;
        }
    }

    /**
     * 从 URL 提取文件名
     * @param url - 文件 URL
     * @returns 清理后的文件名
     */
    private extractFileName(url: string): string {
        try {
            // 解析 URL
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;

            // 提取文件名（路径的最后一部分）
            let fileName = pathname.split("/").pop() || "file";

            // 解码 URL 编码
            fileName = decodeURIComponent(fileName);

            // 如果文件名没有扩展名，尝试从 URL 中猜测
            if (!extname(fileName)) {
                const match = url.match(/\.(\w{2,4})(\?|$)/);
                if (match) {
                    fileName += "." + match[1];
                }
            }

            // 清理文件名，移除非法字符
            fileName = this.sanitizeFileName(fileName);

            // 如果文件名太长，截断（保留扩展名）
            const ext = extname(fileName);
            const baseName = fileName.substring(0, fileName.length - ext.length);
            if (baseName.length > 100) {
                fileName = baseName.substring(0, 100) + ext;
            }

            // 添加时间戳避免文件名冲突
            const timestamp = Date.now();
            const nameWithoutExt = fileName.substring(0, fileName.length - ext.length);
            return `${nameWithoutExt}_${timestamp}${ext}`;
        } catch (error) {
            // 如果解析失败，使用时间戳作为文件名
            return `file_${Date.now()}`;
        }
    }

    /**
     * 清理文件名中的非法字符
     * @param fileName - 原始文件名
     * @returns 清理后的文件名
     */
    private sanitizeFileName(fileName: string): string {
        return fileName
            .replace(/[<>:"/\\|?*]/g, "_") // 替换非法字符
            .replace(/\s+/g, "_")          // 将空格替换为下划线
            .trim();
    }

    /**
     * 获取已下载文件的映射表
     * @returns 已下载文件的映射表
     */
    public getDownloadedFiles(): Map<string, DownloadedFile> {
        return this.downloadedFiles;
    }

    /**
     * 清空下载记录
     */
    public clearCache(): void {
        this.downloadedFiles.clear();
    }
}
