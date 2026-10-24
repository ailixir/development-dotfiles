# v6 unused-parameter ownership amendment

Adopt v5/v4 rules unchanged. Add only ReportsPage.tsx onChange unused event parameter rename to _event, preserving handler arity/body. B7 sole unused-code diagnostic TS6133 is recorded red and owned by11FE; do not change compiler flags or claim the old check passed. Off-tree/sandbox now, real copyback only11MERGE. No source/main/quality gate is waived.
