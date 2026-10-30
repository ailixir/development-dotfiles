import { describe, expect, it } from 'vitest';
import {
  QUICK_START_TEMPLATES,
  TEMPLATE_STEP_PREFIXES,
  availableQuickStartTemplates,
  referencedNames,
} from './quickStartTemplates';

/**
 * A template is the one piece of Studio copy that becomes a user's draft verbatim, so it is the
 * one place where "reads fine" is not enough. These assertions pin it to the mechanism:
 * familiar action prefixes on the way in, the runner's default-deny allowlist on the way out,
 * and the reference rule that rejected the previous `<secret sec_abc123>` template.
 */
describe('quick start templates', () => {
  // STUDIO-OBS-008 AC-5 / GA C-7: secret templates follow the server capability, never a build flag.
  it('with secrets unavailable, offers no template that declares or references a secret', () => {
    const offered = availableQuickStartTemplates(false);
    expect(offered).not.toHaveLength(0);
    expect(offered.flatMap((template) => template.variables).some((variable) => variable.type === 'secret')).toBe(false);
    for (const template of offered) {
      expect(referencedNames(template).secrets, template.id).toEqual([]);
      expect(template.steps.join('\n')).not.toMatch(/<secret\s/u);
    }
    expect(offered.map((template) => template.id)).not.toContain('daily-sign-on');
  });

  it('with secrets available, offers every template, the sign-on check included', () => {
    const offered = availableQuickStartTemplates(true);
    expect(offered).toEqual(QUICK_START_TEMPLATES);
    expect(offered.map((template) => template.id)).toContain('daily-sign-on');
  });

  it('carries no struck secret-fill copy (ruling A2)', () => {
    for (const template of QUICK_START_TEMPLATES) {
      for (const text of [template.title, template.purpose, ...template.steps]) {
        expect(text).not.toMatch(/password box/iu);
      }
    }
  });

  it('offers six distinct templates', () => {
    expect(QUICK_START_TEMPLATES).toHaveLength(6);
    expect(new Set(QUICK_START_TEMPLATES.map((t) => t.id)).size).toBe(6);
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
        // A secret is only ever typed into a field: the value of `fill`. A secret named anywhere
        // but a "Type ..." line has no place to go.
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
