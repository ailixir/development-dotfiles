# QA15 deterministic public document revision

The reviewed revision is `story-content-sha256-v1:` plus SHA256 of the recipe's UTF-8 canonical bytes. The exact recipe file and its SHA are bound in the gate. Run it against the current canonical story before PO closure; first verify the recipe SHA.

Only CRLF/CR to LF conversion, the exact lifecycle Status table value, Markdown task checkbox marker characters, and the bodies beneath the exact `## QA Results` / `## Change Log` H2 headings are normalized or excluded. Both headings remain. Every other title, AC, task text, PO ruling, Dev Agent Record, File List and carry byte is retained after LF conversion. The helper asserts exactly one Status field and each administrative heading.

Checkbox normalization deliberately does not prove task completion. PO must independently check task completeness and provenance. The gate's raw developer input and the actual QA output hashes are separate facts; the earlier raw developer File List pin is not represented as the post-QA raw story hash. Later edits to any retained body require a new review; only permitted administrative bookkeeping is invariant. This one-off public document recipe is not framework/product source validation and changes no acceptance requirement.
