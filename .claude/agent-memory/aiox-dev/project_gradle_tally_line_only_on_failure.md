---
name: gradle-tally-line-only-on-failure
description: `N tests completed, M failed` is printed only when the build fails; a green run has no tally, so aggregate build/test-results/test/TEST-*.xml instead
metadata:
  type: project
---

Gradle's `:test` prints `N tests completed, M failed` **only on failure**. A `BUILD SUCCESSFUL` run
prints no tally at all, so "paste the verbatim tally line" is unsatisfiable for a green run.

Aggregate instead:

```
python3 -c "
import xml.etree.ElementTree as ET,glob
T=F=E=S=0
for f in glob.glob('build/test-results/test/TEST-*.xml'):
    r=ET.parse(f).getroot(); T+=int(r.get('tests'));F+=int(r.get('failures'));E+=int(r.get('errors'));S+=int(r.get('skipped'))
print(f'tests={T} failures={F} errors={E} skipped={S} passed={T-F-E-S}')"
```

The same XML gives per-class counts and the verbatim `<failure message>` for a reddened assertion,
which is what a mutation table needs. Note the reports directory is **not** cleared between runs
unless you change the `--tests` filter set, so scope your glob or re-read after each run.

**Counting `PASSED` event lines does not work on this project either.** The build's `testLogging`
emits **`SKIPPED` and `FAILED` events only** — `grep -c PASSED` over a full `-i` log of a green
`studio.*` run returns **0**, while `grep -cE ' SKIPPED$'` returns the real 7. So the advice
"count PASSED/FAILED/SKIPPED event lines" is half-unavailable here. What works: aggregate the XML
for the total, then corroborate on the two dimensions the log *does* emit — XML `skipped` against
`SKIPPED` event lines, XML `failures+errors` against anchored `FAILED$` lines (anchor it: `FAILED$`
also matches `> Task :test FAILED`). A silent `PASSED: 0` is your regex, not a hang — but check
before reporting either way.

**Why:** reported as a caveat on story 10.31's final numbers rather than inventing a line.
**How to apply:** when asked for a tally on a suite you expect to be green, say up front that the
line does not exist and give the aggregate. Related: [[backend-check-baseline]].
