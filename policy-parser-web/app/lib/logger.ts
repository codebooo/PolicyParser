type LogLevel = 'info' | 'warn' | 'error' | 'debug';

class Logger {
    private logs: any[] = [];

    log(level: LogLevel, message: string, data?: any) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            data
        };
        console.log(JSON.stringify(entry)); // Print to stdout for Vercel logs
        this.logs.push(entry);
    }

    info(message: string, data?: any) { this.log('info', message, data); }
    warn(message: string, data?: any) { this.log('warn', message, data); }
    error(message: string, data?: any) { this.log('error', message, data); }
    debug(message: string, data?: any) { this.log('debug', message, data); }

    getLogs() {
        return this.logs;
    }
}

export const logger = new Logger();
