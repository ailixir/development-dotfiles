# GSMB-WRAPPER-1 source disclosure correction — static only

This is the active resume3 disclosure. The original Aria ruling07603814… and all sealed prior
packages remain unchanged. Quinn's independent `qa/gsm-b-driver-rereview/wrapper-disposition.md`
a687… corrects the earlier successful-query row; root now durably adopted that exact corrected bounded disposition against preserved v7 in
`resume2-gsmb-wrapper-root-adoption.json`8090ef335a03b661…; driver/runtime/source/W1 approval is absent. No test/mutation/query-log/runtime or lane evidence is manufactured by this table.

| Composition reaching sideEffectConfirmation | Old corrected GSMa | New GSMb | Isolated delete-side-effect |
| --- | ---: | ---: | ---: |
| Missing store |0, wrapper409 |0, wrapper409 |0, wrapper409 |
| Installed-empty store |1, wrapper409 |1, wrapper409 |1, wrapper409 |
| Present state, successful continuation |2 |2 |1 |

Old corrected GSMa performs the wrapper EXISTS and the late continuation `if` EXISTS.
New GSMb keeps the wrapper and replaces that late check with the new first-lambda EXISTS.
The isolated deletion leaves only the wrapper. Earlier rejected present-state operations can
have different query counts/order because the read moved; this is no blanket identical-query
or measured-neutrality claim. All checks retain real transaction/session lock and authority.

Preserve seven calls/one helper, five negative identities, both missing-store/empty-state
fixtures, both clarify arms and all five exact isolated mutants. The side-effect case is an
old/new409 no-write control. Its isolated deletion is expected to survive the absence suite;
actual per-site seven→six source evidence supplies only that dominated call's structural
obligation under that exact adopted bounded disposition. Other four mutants still need intended assertion-red,
and full red/control/green/original b01/b02/b03/native/neutrality/source gates remain required.
No fake old accepted-red, kill, query flapping, administrative state deletion or source guard
removal is permitted to manufacture unavailable behavioral proof.
