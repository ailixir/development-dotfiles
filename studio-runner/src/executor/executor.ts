import type { BrowserAdapter, LocatorHandle, ResolvedMatcher, ValueResolver } from './adapters/BrowserAdapter.js';
import type { Clock, StepReporter, StepStatus } from './adapters/StepReporter.js';
import type { FillValue, Operation, TextMatcher } from './operations.js';
import type { Redactor } from './redaction.js';
import { createRedactor, safeMessage } from './redaction.js';
import { EXECUTOR_VERSION } from '../versions.js';

/**
 * Trusted executor (AC-12..AC-15).
 *
 * It consumes the validator's typed operation list and calls `BrowserAdapter` methods with the
 * validated arguments. There is no path from artifact text to execution here: no `eval`, no
 * `Function`, no `vm`, no dynamic `import()`, no async IIFE. The operation objects are data, and
 * the switch below is the entire set of things the runner can be made to do.
 */

/** One step, as produced by the validator, ready to execute. */
export interface ExecutableStep {
  readonly stepIndex: number;
  readonly operations: readonly Operation[];
}

export interface StepOutcome {
  readonly stepIndex: number;
  readonly status: StepStatus;
  readonly startedAtMs: number | null;
  readonly finishedAtMs: number | null;
  readonly durationMs: number | null;
  readonly failure: string | null;
}

export interface ExecutionResult {
  readonly ok: boolean;
  readonly executorVersion: string;
  readonly steps: readonly StepOutcome[];
}

export interface ExecuteOptions {
  readonly steps: readonly ExecutableStep[];
  readonly adapter: BrowserAdapter;
  readonly reporter: StepReporter;
  readonly resolver: ValueResolver;
  readonly clock?: Clock | undefined;
  /** Maximum length of a redacted failure message (AC-15). */
  readonly maxFailureMessageLength?: number | undefined;
}

const DEFAULT_MAX_FAILURE_MESSAGE_LENGTH = 400;

/** Monotonic by construction: `performance.now()` is not affected by wall-clock adjustments. */
const defaultClock: Clock = { now: () => performance.now() };

export async function executeSteps(options: ExecuteOptions): Promise<ExecutionResult> {
  const clock = options.clock ?? defaultClock;
  const maxMessage = options.maxFailureMessageLength ?? DEFAULT_MAX_FAILURE_MESSAGE_LENGTH;
  const redactor = createRedactor(options.resolver.knownValues());

  const outcomes: StepOutcome[] = [];
  let failed = false;

  for (const step of options.steps) {
    if (failed) {
      const skipped: StepOutcome = {
        stepIndex: step.stepIndex,
        status: 'SKIPPED',
        startedAtMs: null,
        finishedAtMs: null,
        durationMs: null,
        failure: null,
      };
      outcomes.push(skipped);
      options.reporter.stepFinished(skipped);
      continue;
    }

    const startedAtMs = clock.now();
    options.reporter.stepStarted({ stepIndex: step.stepIndex, startedAtMs });

    let failure: string | null = null;
    try {
      for (const operation of step.operations) {
        await runOperation(operation, options.adapter, options.resolver);
      }
    } catch (error) {
      failure = safeMessage(error, redactor, maxMessage);
      failed = true;
    }

    const finishedAtMs = clock.now();
    const outcome: StepOutcome = {
      stepIndex: step.stepIndex,
      status: failure === null ? 'PASS' : 'FAIL',
      startedAtMs,
      finishedAtMs,
      durationMs: finishedAtMs - startedAtMs,
      failure,
    };
    outcomes.push(outcome);
    options.reporter.stepFinished(outcome);
  }

  return {
    ok: !failed,
    executorVersion: EXECUTOR_VERSION,
    steps: outcomes,
  };
}

/** Resolves a text/URL matcher. Secrets never reach this path (they are `fill` values only). */
function resolveMatcher(value: TextMatcher, resolver: ValueResolver): ResolvedMatcher {
  switch (value.kind) {
    case 'literal':
      return { kind: 'string', value: value.value };
    case 'variable':
      return { kind: 'string', value: resolver.variable(value.name) };
    case 'regex':
      return { kind: 'pattern', source: value.source, flags: value.flags };
  }
}

/**
 * Resolves a `fill` value. This is the single call site where a secret is materialised, and the
 * result is handed straight to the adapter without being stored, logged or returned (AC-13).
 */
function resolveFillValue(value: FillValue, resolver: ValueResolver): string {
  switch (value.kind) {
    case 'literal':
      return value.value;
    case 'variable':
      return resolver.variable(value.name);
    case 'secret':
      return resolver.secret(value.id);
  }
}

async function runOperation(
  operation: Operation,
  adapter: BrowserAdapter,
  resolver: ValueResolver,
): Promise<void> {
  switch (operation.op) {
    case 'goto': {
      const url =
        operation.url.kind === 'literal'
          ? operation.url.value
          : resolver.variable(operation.url.name);
      await adapter.goto(url, operation.options);
      return;
    }
    case 'waitForURL':
      await adapter.waitForURL(resolveMatcher(operation.url, resolver), operation.options);
      return;
    case 'expectUrl':
      await adapter.expectUrl(resolveMatcher(operation.expected, resolver), operation.options);
      return;
    case 'expectTitle':
      await adapter.expectTitle(resolveMatcher(operation.expected, resolver), operation.options);
      return;
    case 'click': {
      const target = await locate(operation, adapter);
      await adapter.click(target, operation.options);
      return;
    }
    case 'fill': {
      const target = await locate(operation, adapter);
      await adapter.fill(target, resolveFillValue(operation.value, resolver), operation.options);
      return;
    }
    case 'press': {
      const target = await locate(operation, adapter);
      await adapter.press(target, operation.key.value, operation.options);
      return;
    }
    case 'check': {
      const target = await locate(operation, adapter);
      await adapter.check(target, operation.options);
      return;
    }
    case 'uncheck': {
      const target = await locate(operation, adapter);
      await adapter.uncheck(target, operation.options);
      return;
    }
    case 'hover': {
      const target = await locate(operation, adapter);
      await adapter.hover(target, operation.options);
      return;
    }
    case 'selectOption': {
      const target = await locate(operation, adapter);
      const value =
        operation.value.kind === 'literal'
          ? operation.value.value
          : resolver.variable(operation.value.name);
      await adapter.selectOption(target, value, operation.options);
      return;
    }
    case 'expectVisible': {
      const target = await locate(operation, adapter);
      await adapter.expectVisible(target, operation.options);
      return;
    }
    case 'expectContainText': {
      const target = await locate(operation, adapter);
      await adapter.expectContainText(
        target,
        resolveMatcher(operation.expected, resolver),
        operation.options,
      );
      return;
    }
    case 'expectValue': {
      const target = await locate(operation, adapter);
      await adapter.expectValue(
        target,
        resolveMatcher(operation.expected, resolver),
        operation.options,
      );
      return;
    }
  }
}

async function locate(
  operation: Extract<Operation, { locator: unknown }>,
  adapter: BrowserAdapter,
): Promise<LocatorHandle> {
  return adapter.locate(operation.locator);
}

/** Creates a resolver over plain maps; the runner's real resolver arrives with 10.7/10.13. */
export function createValueResolver(input: {
  readonly variables?: Readonly<Record<string, string>> | undefined;
  readonly secrets?: Readonly<Record<string, string>> | undefined;
}): ValueResolver {
  const variables = input.variables ?? {};
  const secrets = input.secrets ?? {};
  return {
    variable(name: string): string {
      const value = Object.prototype.hasOwnProperty.call(variables, name)
        ? variables[name]
        : undefined;
      if (value === undefined) throw new Error(`Unresolved variable reference "${name}".`);
      return value;
    },
    secret(id: string): string {
      const value = Object.prototype.hasOwnProperty.call(secrets, id) ? secrets[id] : undefined;
      // The id is a reference name, never the value, so it is safe in the message.
      if (value === undefined) throw new Error(`Unresolved secret reference "${id}".`);
      return value;
    },
    knownValues(): readonly string[] {
      return Object.values(secrets);
    },
  };
}

export type { Redactor };
