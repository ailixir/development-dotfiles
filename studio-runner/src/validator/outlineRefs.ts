/**
 * Refs the outline shows, in the form `[ref]` after the quoted name (quoted strings are removed first so a name that contains
 * `[e9]` is not a ref). The same rule as the Java GuidedOutline.requireConsistent: the keys of `facts` must equal this set.
 */
export function shownRefsOf(outline: string): Set<string> {
  const refs = new Set<string>();
  for (const line of outline.split('\n')) {
    const bare = line.replace(/"(?:[^"\\]|\\.)*"/gu, '""');
    for (const match of bare.matchAll(/\[([A-Za-z0-9_-]+)\]/gu)) if (match[1] !== undefined) refs.add(match[1]);
  }
  return refs;
}
