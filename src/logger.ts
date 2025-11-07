export type LogLevel = "error" | "warn" | "info" | "debug";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

export interface Logger {
    level: LogLevel;
    module: string;
    error(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    debug(message: string, context?: Record<string, unknown>): void;
    child(childModule: string): Logger;
}

interface LoggerOptions {
    level?: LogLevel;
    module?: string;
}

/**
 * 创建一个简单的结构化日志记录器，可基于日志级别过滤输出。
 *
 * @param options.level 日志级别，默认为 info
 * @param options.module 模块名称，默认为 "app"
 * @returns Logger 实例
 */
export function createLogger(options: LoggerOptions = {}): Logger {
    const level = options.level ?? "info";
    const moduleName = options.module ?? "app";

    function log(levelName: LogLevel, message: string, context?: Record<string, unknown>): void {
        if (LEVEL_PRIORITY[levelName] > LEVEL_PRIORITY[level]) {
            return;
        }
        const payload = {
            timestamp: new Date().toISOString(),
            level: levelName,
            module: moduleName,
            message,
            ...sanitizeContext(context),
        };
        const output = JSON.stringify(payload);
        const consoleMethod = levelName === "error" ? console.error : levelName === "warn" ? console.warn : console.log;
        consoleMethod(output);
    }

    return {
        level,
        module: moduleName,
        error(message, context) {
            log("error", message, context);
        },
        warn(message, context) {
            log("warn", message, context);
        },
        info(message, context) {
            log("info", message, context);
        },
        debug(message, context) {
            log("debug", message, context);
        },
        child(childModule: string): Logger {
            return createLogger({ level, module: `${moduleName}:${childModule}` });
        },
    };
}

/**
 * 判断给定值是否为有效的日志级别。
 *
 * @param value 需要判断的值
 * @returns 是否属于 LogLevel
 */
export function isValidLogLevel(value: unknown): value is LogLevel {
    return typeof value === "string" && (value === "error" || value === "warn" || value === "info" || value === "debug");
}

function sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> {
    if (!context) {
        return {};
    }
    const sanitizedEntries = Object.entries(context).map(([key, value]) => {
        if (value instanceof Error) {
            return [key, { name: value.name, message: value.message, stack: value.stack }];
        }
        if (typeof value === "bigint") {
            return [key, value.toString()];
        }
        if (typeof value === "function") {
            return [key, value.name || "anonymousFunction"];
        }
        return [key, value];
    });
    return Object.fromEntries(sanitizedEntries);
}
