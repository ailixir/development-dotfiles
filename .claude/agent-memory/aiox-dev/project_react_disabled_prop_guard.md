---
name: react-disabled-prop-guard
description: "Removing a button's `disabled` attribute and dispatching a click does NOT reach a React handler — React consults the prop, so that shape of 'the attribute is not the guard' test is vacuous"
metadata:
  type: project
---

React's synthetic event system checks the element's **`disabled` prop**, not the DOM attribute,
before invoking `onClick`. So this shape, which reads like a strong guard, cannot fail:

```tsx
expect(control).toBeDisabled();
control.removeAttribute('disabled');            // does nothing useful
control.dispatchEvent(new MouseEvent('click', { bubbles: true }));
expect(requests).toBe(1);                       // green with the real guard deleted
```

**Why:** measured on story 10.11c (AC-29 / AD2-1). The criterion required the *request-level* guard —
an in-flight `useRef` in `useCompileReview` — to stay **independently** falsifiable now that the
control is also `disabled` while a confirm is in flight. The attribute-defeat version was written on
the reasoning that "an attribute is beaten by any programmatic activation", which is true of plain
DOM but false through React's delegated listener. With the ref deleted the whole review suite stayed
**134/134 green**: a guard for a guard that could not fail.

**How to apply:** when a control is disabled for reason A and you need to prove the separate guard B
behind it, assert B **where it lives** — `renderHook` the hook and call the callback twice in one
synchronous turn, inside a request window held open by the MSW handler. Keep the UI-level case too,
but say in its comment that it asserts the *affordance* and not the guard. This generalises to every
"the `disabled` prop must not stand in for the guard" criterion in the Studio review surface.

Related: [[vacuous-guard-shapes]], [[falsify-from-the-unfavourable-side]]
