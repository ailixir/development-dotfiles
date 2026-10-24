import { NULL_REDACTOR } from '../executor/redaction.js';
export function createCounters() {
    const values = new Map();
    return {
        increment(name, amount = 1) {
            values.set(name, (values.get(name) ?? 0) + amount);
        },
        snapshot() {
            return Object.fromEntries(values);
        },
    };
}
/** Sink that writes to stdout, which is what the platform collects. */
export function createStdoutSink() {
    return {
        write(line) {
            process.stdout.write(`${line}\n`);
        },
    };
}
export function createRecordingLogSink() {
    const lines = [];
    return {
        lines,
        write(line) {
            lines.push(line);
        },
    };
}
export function createLogger(options) {
    const counters = options.counters ?? createCounters();
    const redactor = options.redactor ?? NULL_REDACTOR;
    const clock = options.clock ?? (() => new Date().toISOString());
    const sink = options.sink;
    const logger = {
        counters,
        log(level, event, fields) {
            const line = JSON.stringify({ ts: clock(), level, event, ...(fields ?? {}) });
            // Serialize, then redact. Never the other way round (AC-20).
            sink.write(redactor.redact(line));
        },
        info(event, fields) {
            logger.log('info', event, fields);
        },
        warn(event, fields) {
            logger.log('warn', event, fields);
        },
        error(event, fields) {
            logger.log('error', event, fields);
        },
        record(level, event, counter, fields) {
            counters.increment(counter);
            logger.log(level, event, fields);
        },
        withRedactor(next) {
            return createLogger({ sink, counters, redactor: next, clock });
        },
    };
    return logger;
}
//# sourceMappingURL=logging.js.map