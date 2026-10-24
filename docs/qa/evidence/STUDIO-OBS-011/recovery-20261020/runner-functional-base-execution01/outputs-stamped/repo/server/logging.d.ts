/**
 * Structured, redacted logging (AC-18, AC-20, architecture §9.2).
 *
 * Two properties, both of which are assertions on **what leaves**, not on what was intended:
 *
 * 1. A log line is serialized first and redacted second. Redacting the fields of an object and
 *    then serializing it lets a field added later escape, because nobody remembered to add it to
 *    the redaction list. Redacting the finished JSON string catches every field, including ones
 *    that do not exist yet.
 * 2. The only run-identifying data a line may carry are the AC-13 identity fields. Job values,
 *    resolved values and artifact source text are never fields of a log line at all — the
 *    redactor is the second line of defence, not the first.
 *
 * The counter metric sits here too: an ambiguous admission or a `409` on a report is recorded as
 * a structured line plus a counter and **nowhere else**. There is no durable runner-side store
 * (AC-18); the durable record of a terminal result is the object-store manifest, which is 10.14.
 */
import type { Redactor } from '../executor/redaction.js';
export type LogLevel = 'info' | 'warn' | 'error';
/** The identity fields a log line may carry about a run (AC-13, AC-20). Nothing else. */
export interface RunIdentity {
    readonly executionId?: string;
    readonly attemptId?: string;
    readonly admissionId?: string;
    readonly runnerInstanceId?: string;
    readonly runnerSequence?: number;
}
export type LogFields = RunIdentity & Readonly<Record<string, string | number | boolean | undefined>>;
/** Where finished log lines go. Receives the serialized, redacted **string** (AC-20). */
export interface LogSink {
    write(line: string): void;
}
export interface Counters {
    increment(name: string, amount?: number): void;
    snapshot(): Readonly<Record<string, number>>;
}
export interface Logger {
    log(level: LogLevel, event: string, fields?: LogFields): void;
    info(event: string, fields?: LogFields): void;
    warn(event: string, fields?: LogFields): void;
    error(event: string, fields?: LogFields): void;
    /** Records a structured line and bumps a counter in one call (AC-9, AC-18). */
    record(level: LogLevel, event: string, counter: string, fields?: LogFields): void;
    readonly counters: Counters;
    /** Returns a logger that redacts `values` in addition to whatever this one redacts. */
    withRedactor(redactor: Redactor): Logger;
}
export declare function createCounters(): Counters;
/** Sink that writes to stdout, which is what the platform collects. */
export declare function createStdoutSink(): LogSink;
/** Sink that keeps lines in memory so tests can assert on the exact bytes written. */
export interface RecordingLogSink extends LogSink {
    readonly lines: readonly string[];
}
export declare function createRecordingLogSink(): RecordingLogSink;
export interface LoggerOptions {
    readonly sink: LogSink;
    readonly counters?: Counters | undefined;
    readonly redactor?: Redactor | undefined;
    readonly clock?: (() => string) | undefined;
}
export declare function createLogger(options: LoggerOptions): Logger;
