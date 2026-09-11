import ts from 'typescript';

import type { ReferenceDeclarations, ValidationBounds } from './bounds.js';
import type { DiagnosticCode, DiagnosticCollector } from './diagnostics.js';
import type { ArgumentKind, OptionValueSchema } from './language.js';
import {
  FORBIDDEN_SELECTOR_FRAGMENTS,
  PERMITTED_REGEX_FLAGS,
  PERMITTED_ROLES,
  PROTOTYPE_PROPERTY_NAMES,
  REFERENCE_METHODS,
} from './language.js';
import type { ReferenceRecorder } from './references.js';
import { checkReferenceUse } from './references.js';
import type {
  LiteralValue,
  RegexValue,
  TextMatcher,
  VariableValue,
  SecretValue,
} from '../executor/operations.js';

/**
 * Per-method argument schemas (AC-8).
 *
 * Every accepted argument is either a bounded literal, a constrained regular expression, a
 * declared reference, or an options object whose keys and value types are enumerated. Anything
 * else — an arbitrary expression, a spread, a computed property, an accessor — is rejected here
 * and never reaches the operation list.
 */

export interface ArgumentContext {
  readonly bounds: ValidationBounds;
  readonly declarations: ReferenceDeclarations;
  readonly collector: DiagnosticCollector;
  readonly recorder: ReferenceRecorder;
  readonly excerpt: (node: ts.Node) => string;
}

export type ArgumentValue = LiteralValue | VariableValue | SecretValue | RegexValue;

/** Option values after validation; `TextMatcher` covers the `name` option of `getByRole`. */
export type OptionValue = string | number | boolean | TextMatcher;
export type OptionBag = Record<string, OptionValue>;

const KEY_PATTERN =
  /^(?:(?:Control|Shift|Alt|Meta|ControlOrMeta)\+)*(?:[A-Za-z0-9]|F(?:[1-9]|1[0-2])|Enter|Escape|Tab|Backspace|Delete|Insert|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Space|[-=[\];',./`~!@#$%^&*()_+{}|:"<>?])$/u;

const SELECTOR_CHARSET = /^[A-Za-z0-9\s_\-#.*,>+~[\]()="':^$|]+$/u;
const SELECTOR_ENGINE_PREFIX = /^\s*[A-Za-z_][A-Za-z0-9_-]*\s*=/u;

/**
 * Names the expression kinds the language denies, so the diagnostic points at the construct the
 * author wrote rather than at a generic "not permitted". Shared by statement and argument
 * positions so both report the same class.
 */
export function classifyDeniedExpression(node: ts.Node): DiagnosticCode | null {
  if (ts.isNewExpression(node)) return 'EXPRESSION_NEW';
  if (ts.isSpreadElement(node)) return 'EXPRESSION_SPREAD';
  if (ts.isElementAccessExpression(node)) return 'EXPRESSION_COMPUTED_MEMBER';
  if (ts.isTemplateExpression(node) || ts.isTaggedTemplateExpression(node)) {
    return 'EXPRESSION_TEMPLATE_SUBSTITUTION';
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node)) {
    return 'EXPRESSION_FUNCTION';
  }
  if (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
  ) {
    return 'UNSUPPORTED_TYPESCRIPT';
  }
  if (ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken.kind)) {
    return 'EXPRESSION_ASSIGNMENT';
  }
  if (
    (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) &&
    node.questionDotToken !== undefined
  ) {
    return 'EXPRESSION_OPTIONAL_CHAIN';
  }
  return null;
}

function isAssignmentOperator(kind: ts.SyntaxKind): boolean {
  return (
    kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment
  );
}

export function nodeName(node: ts.Node): string {
  return ts.SyntaxKind[node.kind];
}

/** Reports the most specific available diagnostic for an expression the language rejects. */
export function rejectExpression(
  node: ts.Node,
  ctx: ArgumentContext,
  fallback: DiagnosticCode,
  message: string,
): null {
  const code = classifyDeniedExpression(node) ?? fallback;
  ctx.collector.add({ code, message, node: nodeName(node), excerpt: ctx.excerpt(node) });
  return null;
}

function readStringLiteral(node: ts.Expression, ctx: ArgumentContext, max: number): string | null {
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) {
    rejectExpression(node, ctx, 'ARGUMENT_TYPE', 'Expected a string literal.');
    return null;
  }
  if (node.text.length > max) {
    ctx.collector.add({
      code: 'ARGUMENT_TOO_LONG',
      message: `String literal is ${String(node.text.length)} characters, over the ${String(max)} character limit.`,
      node: nodeName(node),
      excerpt: ctx.excerpt(node),
    });
    return null;
  }
  return node.text;
}

/** Recognises `vars.get('NAME')` / `vars.secret('ID')` and nothing else on `vars`. */
function readReference(
  node: ts.Expression,
  ctx: ArgumentContext,
  argumentKind: ArgumentKind,
): VariableValue | SecretValue | null {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  const receiver = node.expression.expression;
  if (!ts.isIdentifier(receiver) || receiver.text !== 'vars') return null;

  const excerpt = ctx.excerpt(node);
  const method = node.expression.name.text;
  const kind = Object.prototype.hasOwnProperty.call(REFERENCE_METHODS, method)
    ? REFERENCE_METHODS[method]
    : undefined;
  if (kind === undefined) {
    ctx.collector.add({
      code: 'REFERENCE_METHOD_UNKNOWN',
      message: `Unknown reference method vars.${method}(); only vars.get and vars.secret exist.`,
      node: nodeName(node),
      excerpt,
    });
    return null;
  }

  if (node.arguments.length !== 1) {
    ctx.collector.add({
      code: 'REFERENCE_ARGUMENT_INVALID',
      message: `vars.${method}() takes exactly one string literal argument.`,
      node: nodeName(node),
      excerpt,
    });
    return null;
  }
  const first = node.arguments[0];
  if (first === undefined || (!ts.isStringLiteral(first) && !ts.isNoSubstitutionTemplateLiteral(first))) {
    ctx.collector.add({
      code: 'REFERENCE_ARGUMENT_INVALID',
      message: `vars.${method}() takes exactly one string literal argument.`,
      node: nodeName(node),
      excerpt,
    });
    return null;
  }

  const usage = { kind, name: first.text, argumentKind } as const;
  ctx.recorder.record(usage);
  if (!checkReferenceUse(usage, ctx.declarations, ctx.bounds, ctx.collector, excerpt)) return null;

  return kind === 'secret' ? { kind: 'secret', id: first.text } : { kind: 'variable', name: first.text };
}

/** Validates a regular expression literal against the safe subset (AC-8). */
export function readRegexLiteral(
  node: ts.Expression,
  ctx: ArgumentContext,
): RegexValue | null {
  if (!ts.isRegularExpressionLiteral(node)) return null;
  const raw = node.text;
  const excerpt = ctx.excerpt(node);

  if (raw.length > ctx.bounds.maxRegexLength) {
    ctx.collector.add({
      code: 'REGEX_TOO_LONG',
      message: `Regular expression is ${String(raw.length)} characters, over the ${String(ctx.bounds.maxRegexLength)} character limit.`,
      node: nodeName(node),
      excerpt,
    });
    return null;
  }

  const lastSlash = raw.lastIndexOf('/');
  const source = raw.slice(1, lastSlash);
  const flags = raw.slice(lastSlash + 1);

  for (const flag of flags) {
    if (!PERMITTED_REGEX_FLAGS.includes(flag)) {
      ctx.collector.add({
        code: 'REGEX_FLAGS_NOT_PERMITTED',
        message: `Regular expression flag "${flag}" is not permitted; allowed flags are ${PERMITTED_REGEX_FLAGS.join(', ')}.`,
        node: nodeName(node),
        excerpt,
      });
      return null;
    }
  }

  const unsafe = findUnsafeRegexConstruct(source, ctx.bounds.maxRegexQuantifierNesting);
  if (unsafe !== null) {
    ctx.collector.add({
      code: 'REGEX_UNSAFE',
      message: `Regular expression rejected: ${unsafe}.`,
      node: nodeName(node),
      excerpt,
    });
    return null;
  }

  try {
    // Compiling proves the pattern is well formed. It is never executed against artifact text.
    new RegExp(source, flags);
  } catch {
    ctx.collector.add({
      code: 'REGEX_INVALID',
      message: 'Regular expression does not compile.',
      node: nodeName(node),
      excerpt,
    });
    return null;
  }

  return { kind: 'regex', source, flags };
}

/**
 * Rejects backreferences, lookbehind and quantifier nesting beyond the configured depth, which
 * are the constructs that turn a matcher into a denial-of-service primitive.
 */
export function findUnsafeRegexConstruct(source: string, maxNesting: number): string | null {
  const isQuantifier = (index: number): boolean => {
    const char = source[index];
    return char === '*' || char === '+' || char === '?' || char === '{';
  };

  const stack: number[] = [0];
  let inClass = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (char === '\\') {
      const next = source[i + 1];
      if (next !== undefined && /[1-9]/u.test(next)) return 'backreferences are not permitted';
      if (next === 'k') return 'named backreferences are not permitted';
      i += 1;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }
    if (char === '[') {
      inClass = true;
      continue;
    }
    if (char === '(') {
      if (source.startsWith('(?<=', i) || source.startsWith('(?<!', i)) {
        return 'lookbehind assertions are not permitted';
      }
      stack.push(0);
      continue;
    }
    if (char === ')') {
      const inner = stack.pop() ?? 0;
      if (stack.length === 0) return 'unbalanced group';
      const quantified = isQuantifier(i + 1);
      const contribution = quantified ? inner + 1 : inner;
      const parent = stack[stack.length - 1] ?? 0;
      stack[stack.length - 1] = Math.max(parent, contribution);
      if (contribution > maxNesting) {
        return `quantifier nesting depth ${String(contribution)} exceeds the limit of ${String(maxNesting)}`;
      }
      continue;
    }
    if (isQuantifier(i)) {
      const parent = stack[stack.length - 1] ?? 0;
      stack[stack.length - 1] = Math.max(parent, 1);
      if (1 > maxNesting) return 'quantifiers are not permitted';
    }
  }

  if (stack.length !== 1) return 'unbalanced group';
  return null;
}

/** CSS-only selector check for `locator()` (AC-7). */
function readSelector(node: ts.Expression, ctx: ArgumentContext): string | null {
  const text = readStringLiteral(node, ctx, ctx.bounds.maxSelectorLength);
  if (text === null) return null;
  const excerpt = ctx.excerpt(node);

  if (text.trim().length === 0) {
    ctx.collector.add({
      code: 'SELECTOR_NOT_CSS',
      message: 'Selector must not be empty.',
      node: nodeName(node),
      excerpt,
    });
    return null;
  }
  for (const fragment of FORBIDDEN_SELECTOR_FRAGMENTS) {
    if (text.includes(fragment)) {
      ctx.collector.add({
        code: 'SELECTOR_NOT_CSS',
        message: `Selector uses the Playwright selector-engine construct "${fragment}"; locator() accepts CSS only.`,
        node: nodeName(node),
        excerpt,
      });
      return null;
    }
  }
  if (SELECTOR_ENGINE_PREFIX.test(text)) {
    ctx.collector.add({
      code: 'SELECTOR_NOT_CSS',
      message: 'Selector uses an engine prefix (for example "text=" or "xpath="); locator() accepts CSS only.',
      node: nodeName(node),
      excerpt,
    });
    return null;
  }
  if (!SELECTOR_CHARSET.test(text)) {
    ctx.collector.add({
      code: 'SELECTOR_NOT_CSS',
      message: 'Selector contains characters outside the permitted CSS character set.',
      node: nodeName(node),
      excerpt,
    });
    return null;
  }
  return text;
}

function readUrlLiteral(node: ts.Expression, ctx: ArgumentContext): LiteralValue | null {
  const text = readStringLiteral(node, ctx, ctx.bounds.maxUrlLength);
  if (text === null) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    ctx.collector.add({
      code: 'ARGUMENT_VALUE_NOT_PERMITTED',
      message: 'URL must be an absolute http or https URL.',
      node: nodeName(node),
      excerpt: ctx.excerpt(node),
    });
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    ctx.collector.add({
      code: 'ARGUMENT_VALUE_NOT_PERMITTED',
      message: `URL scheme "${parsed.protocol}" is not permitted; only http and https are accepted.`,
      node: nodeName(node),
      excerpt: ctx.excerpt(node),
    });
    return null;
  }
  return { kind: 'literal', value: text };
}

/** Maps each argument kind to the value type it produces. */
export interface ArgumentValueByKind {
  url: LiteralValue | VariableValue;
  urlMatcher: TextMatcher;
  textMatcher: TextMatcher;
  fillValue: LiteralValue | VariableValue | SecretValue;
  selectValue: LiteralValue | VariableValue;
  testId: LiteralValue | VariableValue;
  key: LiteralValue;
  role: LiteralValue;
  selector: LiteralValue;
}

/**
 * Reads one positional argument under its schema. Returns `null` after emitting a diagnostic.
 */
export function readArgument<K extends ArgumentKind>(
  kind: K,
  node: ts.Expression,
  ctx: ArgumentContext,
): ArgumentValueByKind[K] | null {
  const denied = classifyDeniedExpression(node);
  if (denied !== null) {
    ctx.collector.add({
      code: denied,
      message: `This expression is not permitted as a ${kind} argument.`,
      node: nodeName(node),
      excerpt: ctx.excerpt(node),
    });
    return null;
  }
  if (ts.isPropertyAccessExpression(node) && PROTOTYPE_PROPERTY_NAMES.includes(node.name.text)) {
    ctx.collector.add({
      code: 'PROTOTYPE_ACCESS',
      message: `Access to "${node.name.text}" is not permitted.`,
      node: nodeName(node),
      excerpt: ctx.excerpt(node),
    });
    return null;
  }

  const value = readArgumentValue(kind, node, ctx);
  // The per-kind readers above return exactly the variants declared for that kind; the cast
  // narrows the shared union back to the mapped type without widening what is accepted.
  return value as ArgumentValueByKind[K] | null;
}

function readArgumentValue(
  kind: ArgumentKind,
  node: ts.Expression,
  ctx: ArgumentContext,
): ArgumentValue | null {
  switch (kind) {
    case 'url': {
      const reference = readReference(node, ctx, kind);
      if (reference !== null) return reference;
      if (ts.isCallExpression(node)) return null;
      return readUrlLiteral(node, ctx);
    }
    case 'urlMatcher':
    case 'textMatcher': {
      if (ts.isRegularExpressionLiteral(node)) return readRegexLiteral(node, ctx);
      const reference = readReference(node, ctx, kind);
      if (reference !== null) return reference;
      if (ts.isCallExpression(node)) return null;
      const text = readStringLiteral(node, ctx, ctx.bounds.maxStringLength);
      return text === null ? null : { kind: 'literal', value: text };
    }
    case 'fillValue':
    case 'selectValue':
    case 'testId': {
      const reference = readReference(node, ctx, kind);
      if (reference !== null) return reference;
      if (ts.isCallExpression(node)) return null;
      const text = readStringLiteral(node, ctx, ctx.bounds.maxStringLength);
      return text === null ? null : { kind: 'literal', value: text };
    }
    case 'key': {
      const text = readStringLiteral(node, ctx, ctx.bounds.maxStringLength);
      if (text === null) return null;
      if (!KEY_PATTERN.test(text)) {
        ctx.collector.add({
          code: 'ARGUMENT_VALUE_NOT_PERMITTED',
          message: `"${text}" is not a permitted keyboard key.`,
          node: nodeName(node),
          excerpt: ctx.excerpt(node),
        });
        return null;
      }
      return { kind: 'literal', value: text };
    }
    case 'role': {
      const text = readStringLiteral(node, ctx, ctx.bounds.maxStringLength);
      if (text === null) return null;
      if (!PERMITTED_ROLES.includes(text)) {
        ctx.collector.add({
          code: 'ARGUMENT_VALUE_NOT_PERMITTED',
          message: `"${text}" is not a permitted ARIA role.`,
          node: nodeName(node),
          excerpt: ctx.excerpt(node),
        });
        return null;
      }
      return { kind: 'literal', value: text };
    }
    case 'selector': {
      const text = readSelector(node, ctx);
      return text === null ? null : { kind: 'literal', value: text };
    }
    default:
      return null;
  }
}

/**
 * Reads a trailing options object against the method's key schema (AC-8). Unknown keys,
 * computed keys, accessors, shorthand, spreads and wrongly typed values are all rejected.
 */
export function readOptions(
  schema: Readonly<Record<string, OptionValueSchema>>,
  node: ts.Expression,
  ctx: ArgumentContext,
): OptionBag | null {
  if (!ts.isObjectLiteralExpression(node)) {
    rejectExpression(node, ctx, 'OPTION_NOT_OBJECT', 'Options must be an object literal.');
    return null;
  }
  if (node.properties.length > ctx.bounds.maxOptionKeys) {
    ctx.collector.add({
      code: 'OPTION_LIMIT_EXCEEDED',
      message: `Options object has ${String(node.properties.length)} keys, over the ${String(ctx.bounds.maxOptionKeys)} key limit.`,
      node: nodeName(node),
      excerpt: ctx.excerpt(node),
    });
    return null;
  }

  const bag: OptionBag = {};
  let ok = true;

  for (const property of node.properties) {
    const excerpt = ctx.excerpt(property);
    if (ts.isGetAccessorDeclaration(property) || ts.isSetAccessorDeclaration(property)) {
      ok = false;
      ctx.collector.add({
        code: 'OPTION_ACCESSOR',
        message: 'Getters and setters are not permitted in an options object.',
        node: nodeName(property),
        excerpt,
      });
      continue;
    }
    if (ts.isSpreadAssignment(property)) {
      ok = false;
      ctx.collector.add({
        code: 'EXPRESSION_SPREAD',
        message: 'Spread is not permitted in an options object.',
        node: nodeName(property),
        excerpt,
      });
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property)) {
      ok = false;
      ctx.collector.add({
        code: 'OPTION_SHORTHAND',
        message: 'Shorthand properties are not permitted; write the value explicitly.',
        node: nodeName(property),
        excerpt,
      });
      continue;
    }
    if (ts.isMethodDeclaration(property)) {
      ok = false;
      ctx.collector.add({
        code: 'EXPRESSION_FUNCTION',
        message: 'Methods are not permitted in an options object.',
        node: nodeName(property),
        excerpt,
      });
      continue;
    }
    if (!ts.isPropertyAssignment(property)) {
      ok = false;
      ctx.collector.add({
        code: 'OPTION_UNKNOWN_KEY',
        message: 'Unsupported options property.',
        node: nodeName(property),
        excerpt,
      });
      continue;
    }
    if (ts.isComputedPropertyName(property.name)) {
      ok = false;
      ctx.collector.add({
        code: 'OPTION_COMPUTED_KEY',
        message: 'Computed property keys are not permitted in an options object.',
        node: nodeName(property.name),
        excerpt,
      });
      continue;
    }
    const key =
      ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
        ? property.name.text
        : null;
    if (key === null || PROTOTYPE_PROPERTY_NAMES.includes(key)) {
      ok = false;
      ctx.collector.add({
        code: key === null ? 'OPTION_UNKNOWN_KEY' : 'PROTOTYPE_ACCESS',
        message: 'Option key is not permitted.',
        node: nodeName(property.name),
        excerpt,
      });
      continue;
    }
    const valueSchema = Object.prototype.hasOwnProperty.call(schema, key) ? schema[key] : undefined;
    if (valueSchema === undefined) {
      ok = false;
      ctx.collector.add({
        code: 'OPTION_UNKNOWN_KEY',
        message: `Unknown option key "${key}"; permitted keys are ${Object.keys(schema).join(', ') || '(none)'}.`,
        node: nodeName(property.name),
        excerpt,
      });
      continue;
    }
    const value = readOptionValue(key, valueSchema, property.initializer, ctx);
    if (value === null) {
      ok = false;
      continue;
    }
    bag[key] = value;
  }

  return ok ? bag : null;
}

function readOptionValue(
  key: string,
  schema: OptionValueSchema,
  node: ts.Expression,
  ctx: ArgumentContext,
): OptionValue | null {
  const excerpt = ctx.excerpt(node);
  switch (schema.type) {
    case 'boolean': {
      if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
      ctx.collector.add({
        code: 'OPTION_VALUE_TYPE',
        message: `Option "${key}" must be a boolean literal.`,
        node: nodeName(node),
        excerpt,
      });
      return null;
    }
    case 'integer': {
      if (!ts.isNumericLiteral(node)) {
        ctx.collector.add({
          code: 'OPTION_VALUE_TYPE',
          message: `Option "${key}" must be a numeric literal.`,
          node: nodeName(node),
          excerpt,
        });
        return null;
      }
      const parsed = Number(node.text);
      if (!Number.isInteger(parsed) || parsed < schema.min || parsed > schema.max) {
        ctx.collector.add({
          code: 'OPTION_VALUE_TYPE',
          message: `Option "${key}" must be an integer between ${String(schema.min)} and ${String(schema.max)}.`,
          node: nodeName(node),
          excerpt,
        });
        return null;
      }
      return parsed;
    }
    case 'enum': {
      const text = readStringLiteral(node, ctx, ctx.bounds.maxStringLength);
      if (text === null) return null;
      if (!schema.values.includes(text)) {
        ctx.collector.add({
          code: 'OPTION_VALUE_TYPE',
          message: `Option "${key}" must be one of ${schema.values.join(', ')}.`,
          node: nodeName(node),
          excerpt,
        });
        return null;
      }
      return text;
    }
    case 'textMatcher': {
      // Option values never accept a secret reference (architecture §4.5 "References").
      return readArgument('textMatcher', node, ctx);
    }
    default:
      return null;
  }
}
