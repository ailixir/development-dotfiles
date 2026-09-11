import ts from 'typescript';

import type { ArgumentContext, OptionBag } from './arguments.js';
import { classifyDeniedExpression, nodeName, readArgument, readOptions } from './arguments.js';
import type { ReferenceDeclarations, ValidationBounds } from './bounds.js';
import type { DiagnosticCollector } from './diagnostics.js';
import type { MethodSchema } from './language.js';
import {
  ACTION_METHODS,
  LOCATOR_ASSERTIONS,
  LOCATOR_METHODS,
  PAGE_ASSERTIONS,
  PAGE_METHODS,
  PROTOTYPE_PROPERTY_NAMES,
} from './language.js';
import type { ArtifactStep } from './schema.js';
import {
  ReferenceRecorder,
  checkStepReferenceAlignment,
  extractSourceTokens,
} from './references.js';
import type {
  ActionOptions,
  ClickOptions,
  ContainTextOptions,
  GotoOptions,
  HaveUrlOptions,
  LocatorChain,
  LocatorSegment,
  LocatorTextOptions,
  Operation,
  PressOptions,
  RoleOptions,
  TimeoutOptions,
} from '../executor/operations.js';

/**
 * Default-deny program validation (AC-6, AC-7, architecture §4.5).
 *
 * The only accepted program is a bounded sequence of `await <permitted call>;` statements. Each
 * accepted call becomes a typed operation. No branch of this module ever returns source text to
 * the caller, and nothing here evaluates the artifact.
 */

/** `parseDiagnostics` is not part of the public typings but is populated by `createSourceFile`. */
interface ParsedSourceFile extends ts.SourceFile {
  readonly parseDiagnostics?: readonly ts.Diagnostic[] | undefined;
}

/** Reads the options bag only when the schema declares options; keeps arity checks honest. */
interface CallShape {
  readonly positional: readonly ts.Expression[];
  readonly options: OptionBag | undefined;
}

/**
 * `readOptions` has already checked every key and value against the same schema that types
 * these option interfaces, so the bag is structurally the option type.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the call site names the option interface; the bag was already checked against that same schema.
function asOptions<T>(bag: OptionBag | undefined): T | undefined {
  return bag === undefined ? undefined : (bag as unknown as T);
}

function maxDepth(node: ts.Node, current: number, limit: number): number {
  if (current > limit) return current;
  let deepest = current;
  ts.forEachChild(node, (child) => {
    const childDepth = maxDepth(child, current + 1, limit);
    if (childDepth > deepest) deepest = childDepth;
  });
  return deepest;
}

/**
 * Validates one step's code and returns its operations, or `null` after emitting diagnostics.
 */
export function validateStepCode(
  step: ArtifactStep,
  declarations: ReferenceDeclarations,
  bounds: ValidationBounds,
  collector: DiagnosticCollector,
): readonly Operation[] | null {
  const sourceFile: ParsedSourceFile = ts.createSourceFile(
    'step.ts',
    step.code,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );

  const parseDiagnostics = sourceFile.parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    collector.add({
      code: 'SYNTAX_ERROR',
      message: `Step code does not parse: ${ts.flattenDiagnosticMessageText(parseDiagnostics[0]?.messageText, ' ')}`,
    });
    return null;
  }

  if (sourceFile.statements.length === 0) {
    collector.add({
      code: 'STATEMENT_NOT_EXPRESSION',
      message: 'Step code must contain at least one awaited permitted call.',
    });
    return null;
  }

  if (sourceFile.statements.length > bounds.maxStatementsPerStep) {
    collector.add({
      code: 'STATEMENT_LIMIT_EXCEEDED',
      message: `Step has ${String(sourceFile.statements.length)} statements, over the ${String(bounds.maxStatementsPerStep)} statement limit.`,
    });
    return null;
  }

  const excerpt = (node: ts.Node): string =>
    step.code.slice(node.getStart(sourceFile), node.getEnd());

  const recorder = new ReferenceRecorder();
  const ctx: ArgumentContext = { bounds, declarations, collector, recorder, excerpt };

  const operations: Operation[] = [];
  let ok = true;

  for (const statement of sourceFile.statements) {
    const depth = maxDepth(statement, 1, bounds.maxAstDepth);
    if (depth > bounds.maxAstDepth) {
      ok = false;
      collector.add({
        code: 'AST_DEPTH_EXCEEDED',
        message: `Statement nesting depth ${String(depth)} exceeds the limit of ${String(bounds.maxAstDepth)}.`,
        node: nodeName(statement),
      });
      continue;
    }
    const operation = readStatement(statement, ctx);
    if (operation === null) ok = false;
    else operations.push(operation);
  }

  const tokens = extractSourceTokens(step.originalText);
  if (!checkStepReferenceAlignment(recorder.usages(), tokens, collector)) ok = false;

  return ok ? operations : null;
}

function readStatement(statement: ts.Statement, ctx: ArgumentContext): Operation | null {
  if (!ts.isExpressionStatement(statement)) {
    ctx.collector.add({
      code: classifyStatement(statement),
      message: `Only awaited permitted calls are accepted; found ${nodeName(statement)}.`,
      node: nodeName(statement),
      excerpt: ctx.excerpt(statement),
    });
    return null;
  }

  const expression = statement.expression;
  if (!ts.isAwaitExpression(expression)) {
    const denied = classifyDeniedExpression(expression);
    ctx.collector.add({
      code: denied ?? 'STATEMENT_NOT_AWAITED',
      message: 'Every statement must be an awaited permitted call.',
      node: nodeName(expression),
      excerpt: ctx.excerpt(expression),
    });
    return null;
  }

  const call = expression.expression;
  if (!ts.isCallExpression(call)) {
    const denied = classifyDeniedExpression(call);
    ctx.collector.add({
      code: denied ?? 'EXPRESSION_NOT_PERMITTED',
      message: `await must be applied to a permitted call; found ${nodeName(call)}.`,
      node: nodeName(call),
      excerpt: ctx.excerpt(call),
    });
    return null;
  }

  return readCall(call, ctx);
}

function classifyStatement(statement: ts.Statement): 'STATEMENT_DECLARATION' | 'STATEMENT_LOOP' | 'STATEMENT_CONDITIONAL' | 'STATEMENT_IMPORT' | 'STATEMENT_NOT_EXPRESSION' {
  if (
    ts.isVariableStatement(statement) ||
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement)
  ) {
    return 'STATEMENT_DECLARATION';
  }
  if (
    ts.isForStatement(statement) ||
    ts.isForInStatement(statement) ||
    ts.isForOfStatement(statement) ||
    ts.isWhileStatement(statement) ||
    ts.isDoStatement(statement)
  ) {
    return 'STATEMENT_LOOP';
  }
  if (ts.isIfStatement(statement) || ts.isSwitchStatement(statement)) {
    return 'STATEMENT_CONDITIONAL';
  }
  if (
    ts.isImportDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isExportAssignment(statement)
  ) {
    return 'STATEMENT_IMPORT';
  }
  return 'STATEMENT_NOT_EXPRESSION';
}

function readCall(call: ts.CallExpression, ctx: ArgumentContext): Operation | null {
  if (call.questionDotToken !== undefined) {
    ctx.collector.add({
      code: 'EXPRESSION_OPTIONAL_CHAIN',
      message: 'Optional chaining is not permitted.',
      node: nodeName(call),
      excerpt: ctx.excerpt(call),
    });
    return null;
  }
  if (call.typeArguments !== undefined) {
    ctx.collector.add({
      code: 'UNSUPPORTED_TYPESCRIPT',
      message: 'Type arguments are not permitted.',
      node: nodeName(call),
      excerpt: ctx.excerpt(call),
    });
    return null;
  }

  const callee = call.expression;
  if (ts.isElementAccessExpression(callee)) {
    ctx.collector.add({
      code: 'EXPRESSION_COMPUTED_MEMBER',
      message: 'Computed member access is not permitted.',
      node: nodeName(callee),
      excerpt: ctx.excerpt(callee),
    });
    return null;
  }
  if (!ts.isPropertyAccessExpression(callee)) {
    ctx.collector.add({
      code: 'RECEIVER_NOT_PERMITTED',
      message: `Only calls on page, a locator chain rooted at page, or expect(...) are permitted; found ${nodeName(callee)}.`,
      node: nodeName(callee),
      excerpt: ctx.excerpt(callee),
    });
    return null;
  }
  if (callee.questionDotToken !== undefined) {
    ctx.collector.add({
      code: 'EXPRESSION_OPTIONAL_CHAIN',
      message: 'Optional chaining is not permitted.',
      node: nodeName(callee),
      excerpt: ctx.excerpt(callee),
    });
    return null;
  }

  const method = callee.name.text;
  if (PROTOTYPE_PROPERTY_NAMES.includes(method)) {
    ctx.collector.add({
      code: 'PROTOTYPE_ACCESS',
      message: `Access to "${method}" is not permitted.`,
      node: nodeName(callee),
      excerpt: ctx.excerpt(callee),
    });
    return null;
  }

  const receiver = callee.expression;

  if (Object.prototype.hasOwnProperty.call(ACTION_METHODS, method)) {
    const chain = readLocatorChain(receiver, ctx);
    if (chain === null) return null;
    if (chain.segments.length === 0) {
      ctx.collector.add({
        code: 'LOCATOR_CHAIN_INVALID',
        message: `${method}() must be called on a locator, not directly on page.`,
        node: nodeName(receiver),
        excerpt: ctx.excerpt(receiver),
      });
      return null;
    }
    return readAction(method, chain, call, ctx);
  }

  if (Object.prototype.hasOwnProperty.call(PAGE_METHODS, method)) {
    if (!ts.isIdentifier(receiver) || receiver.text !== 'page') {
      ctx.collector.add({
        code: 'RECEIVER_NOT_PERMITTED',
        message: `${method}() is only permitted on page.`,
        node: nodeName(receiver),
        excerpt: ctx.excerpt(receiver),
      });
      return null;
    }
    return readNavigation(method, call, ctx);
  }

  if (
    Object.prototype.hasOwnProperty.call(LOCATOR_ASSERTIONS, method) ||
    Object.prototype.hasOwnProperty.call(PAGE_ASSERTIONS, method)
  ) {
    return readAssertion(method, receiver, call, ctx);
  }

  if (Object.prototype.hasOwnProperty.call(LOCATOR_METHODS, method)) {
    ctx.collector.add({
      code: 'EXPRESSION_NOT_PERMITTED',
      message: `${method}() builds a locator; a statement must be an action, assertion or navigation call.`,
      node: nodeName(call),
      excerpt: ctx.excerpt(call),
    });
    return null;
  }

  ctx.collector.add({
    code: 'METHOD_NOT_PERMITTED',
    message: `Method "${method}" is not part of the permitted surface.`,
    node: nodeName(callee),
    excerpt: ctx.excerpt(callee),
  });
  return null;
}

/** Parses a receiver chain rooted at `page`. An empty segment list means the root itself. */
function readLocatorChain(node: ts.Expression, ctx: ArgumentContext): LocatorChain | null {
  const segments: LocatorSegment[] = [];
  const failed = collectSegments(node, ctx, segments);
  if (failed) return null;
  return { segments };
}

function collectSegments(
  node: ts.Expression,
  ctx: ArgumentContext,
  out: LocatorSegment[],
): boolean {
  if (ts.isIdentifier(node)) {
    if (node.text === 'page') return false;
    ctx.collector.add({
      code: 'RECEIVER_NOT_PERMITTED',
      message: `Locator chains must be rooted at page; found "${node.text}".`,
      node: nodeName(node),
      excerpt: ctx.excerpt(node),
    });
    return true;
  }

  if (!ts.isCallExpression(node)) {
    const denied = classifyDeniedExpression(node);
    ctx.collector.add({
      code: denied ?? 'LOCATOR_CHAIN_INVALID',
      message: `Expected a locator call rooted at page; found ${nodeName(node)}.`,
      node: nodeName(node),
      excerpt: ctx.excerpt(node),
    });
    return true;
  }
  if (node.questionDotToken !== undefined) {
    ctx.collector.add({
      code: 'EXPRESSION_OPTIONAL_CHAIN',
      message: 'Optional chaining is not permitted.',
      node: nodeName(node),
      excerpt: ctx.excerpt(node),
    });
    return true;
  }
  if (ts.isElementAccessExpression(node.expression)) {
    ctx.collector.add({
      code: 'EXPRESSION_COMPUTED_MEMBER',
      message: 'Computed member access is not permitted.',
      node: nodeName(node.expression),
      excerpt: ctx.excerpt(node.expression),
    });
    return true;
  }
  if (!ts.isPropertyAccessExpression(node.expression)) {
    ctx.collector.add({
      code: 'LOCATOR_CHAIN_INVALID',
      message: `Expected a locator call rooted at page; found ${nodeName(node.expression)}.`,
      node: nodeName(node.expression),
      excerpt: ctx.excerpt(node.expression),
    });
    return true;
  }

  const method = node.expression.name.text;
  if (PROTOTYPE_PROPERTY_NAMES.includes(method)) {
    ctx.collector.add({
      code: 'PROTOTYPE_ACCESS',
      message: `Access to "${method}" is not permitted.`,
      node: nodeName(node.expression),
      excerpt: ctx.excerpt(node.expression),
    });
    return true;
  }
  const schema = Object.prototype.hasOwnProperty.call(LOCATOR_METHODS, method)
    ? LOCATOR_METHODS[method]
    : undefined;
  if (schema === undefined) {
    ctx.collector.add({
      code: 'METHOD_NOT_PERMITTED',
      message: `"${method}" is not a permitted locator method.`,
      node: nodeName(node.expression),
      excerpt: ctx.excerpt(node.expression),
    });
    return true;
  }

  if (collectSegments(node.expression.expression, ctx, out)) return true;

  const segment = readLocatorSegment(method, schema, node, ctx);
  if (segment === null) return true;
  out.push(segment);
  return false;
}

function readLocatorSegment(
  method: string,
  schema: MethodSchema,
  call: ts.CallExpression,
  ctx: ArgumentContext,
): LocatorSegment | null {
  const shape = readCallShape(schema, call, ctx, method);
  if (shape === null) return null;
  const first = shape.positional[0];

  switch (method) {
    case 'getByRole': {
      if (first === undefined) return null;
      const role = readArgument('role', first, ctx);
      if (role === null) return null;
      return { kind: 'getByRole', role: role.value, options: asOptions<RoleOptions>(shape.options) };
    }
    case 'getByText':
    case 'getByLabel':
    case 'getByPlaceholder': {
      if (first === undefined) return null;
      const text = readArgument('textMatcher', first, ctx);
      if (text === null) return null;
      const options = asOptions<LocatorTextOptions>(shape.options);
      if (method === 'getByText') return { kind: 'getByText', text, options };
      if (method === 'getByLabel') return { kind: 'getByLabel', text, options };
      return { kind: 'getByPlaceholder', text, options };
    }
    case 'getByTestId': {
      if (first === undefined) return null;
      const testId = readArgument('testId', first, ctx);
      if (testId === null) return null;
      return { kind: 'getByTestId', testId };
    }
    case 'locator': {
      if (first === undefined) return null;
      const selector = readArgument('selector', first, ctx);
      if (selector === null) return null;
      return { kind: 'locator', selector: selector.value };
    }
    default:
      return null;
  }
}

function readNavigation(
  method: string,
  call: ts.CallExpression,
  ctx: ArgumentContext,
): Operation | null {
  const schema = PAGE_METHODS[method];
  if (schema === undefined) return null;
  const shape = readCallShape(schema, call, ctx, method);
  if (shape === null) return null;
  const first = shape.positional[0];
  if (first === undefined) return null;
  const options = asOptions<GotoOptions>(shape.options);

  if (method === 'goto') {
    const url = readArgument('url', first, ctx);
    return url === null ? null : { op: 'goto', url, options };
  }
  const url = readArgument('urlMatcher', first, ctx);
  return url === null ? null : { op: 'waitForURL', url, options };
}

function readAction(
  method: string,
  locator: LocatorChain,
  call: ts.CallExpression,
  ctx: ArgumentContext,
): Operation | null {
  const schema = ACTION_METHODS[method];
  if (schema === undefined) return null;
  const shape = readCallShape(schema, call, ctx, method);
  if (shape === null) return null;
  const first = shape.positional[0];

  switch (method) {
    case 'click':
      return { op: 'click', locator, options: asOptions<ClickOptions>(shape.options) };
    case 'check':
      return { op: 'check', locator, options: asOptions<ActionOptions>(shape.options) };
    case 'uncheck':
      return { op: 'uncheck', locator, options: asOptions<ActionOptions>(shape.options) };
    case 'hover':
      return { op: 'hover', locator, options: asOptions<ActionOptions>(shape.options) };
    case 'fill': {
      if (first === undefined) return null;
      const value = readArgument('fillValue', first, ctx);
      return value === null
        ? null
        : { op: 'fill', locator, value, options: asOptions<ActionOptions>(shape.options) };
    }
    case 'press': {
      if (first === undefined) return null;
      const key = readArgument('key', first, ctx);
      return key === null
        ? null
        : { op: 'press', locator, key, options: asOptions<PressOptions>(shape.options) };
    }
    case 'selectOption': {
      if (first === undefined) return null;
      const value = readArgument('selectValue', first, ctx);
      return value === null
        ? null
        : { op: 'selectOption', locator, value, options: asOptions<ActionOptions>(shape.options) };
    }
    default:
      return null;
  }
}

function readAssertion(
  method: string,
  receiver: ts.Expression,
  call: ts.CallExpression,
  ctx: ArgumentContext,
): Operation | null {
  if (!ts.isCallExpression(receiver) || !ts.isIdentifier(receiver.expression)) {
    ctx.collector.add({
      code: 'RECEIVER_NOT_PERMITTED',
      message: `Assertion "${method}" must be called on expect(...).`,
      node: nodeName(receiver),
      excerpt: ctx.excerpt(receiver),
    });
    return null;
  }
  if (receiver.expression.text !== 'expect') {
    ctx.collector.add({
      code: 'RECEIVER_NOT_PERMITTED',
      message: `Assertion "${method}" must be called on expect(...), not on "${receiver.expression.text}".`,
      node: nodeName(receiver),
      excerpt: ctx.excerpt(receiver),
    });
    return null;
  }
  if (receiver.arguments.length !== 1) {
    ctx.collector.add({
      code: 'ARGUMENT_COUNT',
      message: 'expect() takes exactly one argument.',
      node: nodeName(receiver),
      excerpt: ctx.excerpt(receiver),
    });
    return null;
  }
  const subject = receiver.arguments[0];
  if (subject === undefined) return null;
  const chain = readLocatorChain(subject, ctx);
  if (chain === null) return null;

  if (chain.segments.length === 0) {
    const schema = PAGE_ASSERTIONS[method];
    if (schema === undefined) {
      ctx.collector.add({
        code: 'METHOD_NOT_PERMITTED',
        message: `"${method}" is not a permitted assertion on expect(page).`,
        node: nodeName(call),
        excerpt: ctx.excerpt(call),
      });
      return null;
    }
    const shape = readCallShape(schema, call, ctx, method);
    if (shape === null) return null;
    const first = shape.positional[0];
    if (first === undefined) return null;
    if (method === 'toHaveURL') {
      const expected = readArgument('urlMatcher', first, ctx);
      return expected === null
        ? null
        : { op: 'expectUrl', expected, options: asOptions<HaveUrlOptions>(shape.options) };
    }
    const expected = readArgument('textMatcher', first, ctx);
    return expected === null
      ? null
      : { op: 'expectTitle', expected, options: asOptions<TimeoutOptions>(shape.options) };
  }

  const schema = LOCATOR_ASSERTIONS[method];
  if (schema === undefined) {
    ctx.collector.add({
      code: 'METHOD_NOT_PERMITTED',
      message: `"${method}" is not a permitted assertion on expect(locator).`,
      node: nodeName(call),
      excerpt: ctx.excerpt(call),
    });
    return null;
  }
  const shape = readCallShape(schema, call, ctx, method);
  if (shape === null) return null;

  if (method === 'toBeVisible') {
    return { op: 'expectVisible', locator: chain, options: asOptions<TimeoutOptions>(shape.options) };
  }
  const first = shape.positional[0];
  if (first === undefined) return null;
  const expected = readArgument('textMatcher', first, ctx);
  if (expected === null) return null;
  if (method === 'toContainText') {
    return {
      op: 'expectContainText',
      locator: chain,
      expected,
      options: asOptions<ContainTextOptions>(shape.options),
    };
  }
  return {
    op: 'expectValue',
    locator: chain,
    expected,
    options: asOptions<TimeoutOptions>(shape.options),
  };
}

/** Checks arity, rejects spreads, and reads the trailing options object when the schema has one. */
function readCallShape(
  schema: MethodSchema,
  call: ts.CallExpression,
  ctx: ArgumentContext,
  method: string,
): CallShape | null {
  for (const argument of call.arguments) {
    if (ts.isSpreadElement(argument)) {
      ctx.collector.add({
        code: 'EXPRESSION_SPREAD',
        message: 'Spread arguments are not permitted.',
        node: nodeName(argument),
        excerpt: ctx.excerpt(argument),
      });
      return null;
    }
  }

  const required = schema.positional.length;
  const maximum = schema.options === null ? required : required + 1;
  if (call.arguments.length < required || call.arguments.length > maximum) {
    ctx.collector.add({
      code: 'ARGUMENT_COUNT',
      message: `${method}() takes ${String(required)}${maximum > required ? ` or ${String(maximum)}` : ''} argument(s); found ${String(call.arguments.length)}.`,
      node: nodeName(call),
      excerpt: ctx.excerpt(call),
    });
    return null;
  }

  const positional = call.arguments.slice(0, required);
  const optionsNode = call.arguments.length > required ? call.arguments[required] : undefined;
  if (optionsNode === undefined || schema.options === null) {
    return { positional, options: undefined };
  }
  const options = readOptions(schema.options, optionsNode, ctx);
  if (options === null) return null;
  return { positional, options: Object.keys(options).length === 0 ? undefined : options };
}
