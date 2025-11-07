import pino from "pino";

export type Logger = pino.Logger;

export function createLogger(module: string = "core"): Logger {
    return pino({
        level: process.env.LOG_LEVEL ?? "info",
        base: { module },
        timestamp: () => new Date().toISOString(),
        formatters: {
            level(label) {
                return { level: label };
            },
        },
    });
}

export function createModuleLogger(logger: Logger, module: string): Logger {
    return logger.child({ module });
}
