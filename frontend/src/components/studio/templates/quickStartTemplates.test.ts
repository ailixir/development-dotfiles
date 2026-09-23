import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_ALPHA_TEMPLATES,
  QUICK_START_TEMPLATES,
  TEMPLATE_STEP_PREFIXES,
  referencedNames,
} from './quickStartTemplates';

/**
 * A template is the one piece of Studio copy that becomes a user's draft verbatim, so it is the
 * one place where "reads fine" is not enough. These assertions pin it to the mechanism:
 * familiar action prefixes on the way in, the runner's default-deny allowlist on the way out,
 * and the reference rule that rejected the previous `<secret sec_abc123>` template.
 */
describe('quick start templates', () => {
  it('the production alpha exposes no template that requires Vault secrets', () => {
    expect(PRODUCTION_ALPHA_TEMPLATES).not.toHaveLength(0);
    expect(
      PRODUCTION_ALPHA_TEMPLATES.flatMap((template) => template.variables).some(
        (variable) => variable.type === 'secret',
      ),
    ).toBe(false);
  });

  it('offers three distinct templates', () => {
    expect(QUICK_START_TEMPLATES).toHaveLength(3);
    expect(new Set(QUICK_START_TEMPLATES.map((t) => t.id)).size).toBe(3);
  });

  it.each(QUICK_START_TEMPLATES.map((t) => [t.title, t] as const))(
    '%s starts every step with a prefix the editor accepts',
    (_title, template) => {
      for (const step of template.steps) {
        const accepted = TEMPLATE_STEP_PREFIXES.some((prefix) =>
          step.toLowerCase().startsWith(prefix.toLowerCase()),
        );
        expect(accepted, `unsupported opening: ${step}`).toBe(true);
      }
    },
  );

  it.each(QUICK_START_TEMPLATES.map((t) => [t.title, t] as const))(
    '%s declares every reference its steps mention',
    (_title, template) => {
      const declared = new Set(template.variables.map((v) => v.name));
      const { variables, secrets } = referencedNames(template);
      for (const name of [...variables, ...secrets]) {
        expect(declared, `undeclared reference <${name}>`).toContain(name);
      }
    },
  );

  it.each(QUICK_START_TEMPLATES.map((t) => [t.title, t] as const))(
    '%s keeps secrets out of anything but a typed value',
    (_title, template) => {
      for (const step of template.steps) {
        if (!/<secret\s/u.test(step)) continue;
        // The runner permits `vars.secret(...)` in exactly one argument position: the value of
        // `fill`. A secret named anywhere but a "Type ..." line cannot compile.
        expect(step.startsWith('Type '), `secret outside a typed value: ${step}`).toBe(true);
      }
    },
  );

  it.each(QUICK_START_TEMPLATES.map((t) => [t.title, t] as const))(
    '%s ends by checking something',
    (_title, template) => {
      const last = template.steps[template.steps.length - 1] ?? '';
      expect(last.startsWith('Check that'), `no closing assertion: ${last}`).toBe(true);
    },
  );

  it.each(QUICK_START_TEMPLATES.map((t) => [t.title, t] as const))(
    '%s names references the way the rest of the corpus does',
    (_title, template) => {
      for (const variable of template.variables) {
        // SCREAMING_SNAKE, named after the thing itself. A reference is read next to the field it
        // fills, so PASSWORD beats LOGIN_PASSWORD: the qualifier repeats the step it sits in.
        expect(variable.name, `off-convention name: ${variable.name}`).toMatch(
          /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/u,
        );
      }
    },
  );

  it.each(QUICK_START_TEMPLATES.map((t) => [t.title, t] as const))(
    '%s keeps dashes out of its copy',
    (_title, template) => {
      for (const text of [template.title, template.purpose, ...template.steps]) {
        expect(text, `dash in copy: ${text}`).not.toMatch(/[\u2013\u2014]/u);
      }
    },
  );

  it.each(QUICK_START_TEMPLATES.map((t) => [t.title, t] as const))(
    '%s inlines no credential and stays on one page',
    (_title, template) => {
      for (const step of template.steps) {
        expect(step).not.toMatch(/password"\s*$/iu);
        expect(step).not.toMatch(/\b(new tab|popup|pop-up|iframe|frame|window)\b/iu);
      }
    },
  );
});
