"""Generate Java SOURCE only from this exact helper; never compiler/JVM/socket execution."""
from pathlib import Path
import hashlib,json
HERE=Path(__file__).absolute().parent
assert HERE.name=='resume3' and HERE.parent.name=='c8-check01-public-evidence-prep'
fragment=(HERE/'observer-fragment.java.txt').read_bytes()
header='''import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;
public final class ObserverBoundaryHarness {
  static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
  static javax.net.ssl.SSLContext TLS;
  int port;
  String p3Cookie;
  final java.util.Map<String,String> p3OwnedGuidedCookies = new java.util.HashMap<>();
'''
body=(HERE/'java-harness-body.java.txt').read_bytes()
raw=header.encode()+fragment+b'\n'+body+b'\n}\n'
(HERE/'ObserverBoundaryHarness.java').write_bytes(raw)
(HERE/'java-harness-status.json').write_text(json.dumps(dict(kind='EXACT_HELPER_SYNTHETIC_JAVA_HARNESS_SOURCE_ONLY',
 helperSha256=hashlib.sha256(fragment).hexdigest(),harnessSha256=hashlib.sha256(raw).hexdigest(),
 generatedFromSameHelperBytes=True,compiled=False,executed=False,installedJavaTlsUnixPeerAbiQualified=False,
 caseModes=['parser','tls-good','tls-oversize','tls-stall-handshake','tls-stall-write','tls-stall-body','tls-stall-trailers','tls-dribble','relay'],
 requiresSeparateExactRootNativeScope=True,businessCaseAttemptAllowanceConsumed=False),indent=2)+'\n')
print('Generated exact helper Java harness SOURCE; compiler/native execution UNEXECUTED')
