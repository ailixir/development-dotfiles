# Source06 acquisition and transfer design, before code

One invocation Ownership ledger is created before load. Every Custody registers its actual
object before open, and each successful directory/file open immediately registers a distinct
token before fstat/validation/next acquisition. Tokens are never keyed solely by reusable FD.
OPEN means this owner may perform one close; TRANSFERRED keeps an explicit actual handle and
its closer; CLOSED means a confirmed successful close; UNKNOWN means attempted/unconfirmed
and cannot be retried by bare FD. Failed constructors and transient owners remain strongly
reachable from the invocation ledger and retained-owner registry. Directory chain emptiness
never proves complete ownership discharge.

Custody read/create/write/replace own temporary tokens; System.read shares the ledger;
System.sink explicitly transfers a token to its actual fdopen handle before fstat; System.lock
uses the same token protocol. A fdopen failure is conservatively UNKNOWN. Validated caller
control/output directory tokens may remain open during relay closure; temporary tokens,
failed/unreturned constructors and any UNKNOWN token are never exempt. Relay receives an
explicit ledger view borrowing only those two validated caller directory owners. Complete
relay closure requires that view clear as well as actual assigned sockets/selector/directories
and bounded join. Effects release uses the same view before closing caller custody and requires
complete invocation discharge afterward. No caller closes an async owner's pending resources.

load acquisitions move inside try and the ledger exists before the first factory. On rejection,
close only safe validated caller owners when no unconfirmed or orphan acquisition exists;
otherwise retain control/output/failed-owner/authority references. main wraps load itself and
preserves ledger ownership if no Effects was returned. Confirmed/UNKNOWN close tokens are never
closed again, and a clean fully closed failed operation still discharges while failure remains.

The common pre-adapter loader separately records each acquisition before validation and
tracks each close confirmation; any unknown close denies adapter compilation and retains its
actual bootstrap records in the invocation namespace. Normal/optimized explicit integrity
checks and all entry APIs remain unchanged. No Java/business/privacy or operational scope
changes. All acquired objects/FDs/thread/socket/process boundaries remain synthetic in tests.
