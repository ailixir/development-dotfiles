package com.citi.put.checks.studio.guided.session;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.time.Clock;
import java.util.Base64;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
class GuidedIndependentQaProbeTest {
 @Test void backendAcceptsUnknownSignedClaimAndTrailingWireJson() throws Exception {
  var gen=KeyPairGenerator.getInstance("RSA");gen.initialize(2048);var pair=gen.generateKeyPair();long now=Clock.systemUTC().instant().getEpochSecond();
  String payload="{\"iss\":\"qa-issuer\",\"sub\":\"worker\",\"aud\":\"studio-guided-controller\",\"role\":\"owning-worker\",\"iat\":"+now+",\"exp\":"+(now+60)+",\"extra\":\"unexpected\"}";
  var b64=Base64.getUrlEncoder().withoutPadding();String body=b64.encodeToString("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8))+"."+b64.encodeToString(payload.getBytes(StandardCharsets.UTF_8));var sig=Signature.getInstance("SHA256withRSA");sig.initSign(pair.getPrivate());sig.update(body.getBytes(StandardCharsets.US_ASCII));
  var req=new MockHttpServletRequest();req.addHeader("Authorization","Bearer "+body+"."+b64.encodeToString(sig.sign()));
  try(var in=Files.newInputStream(Path.of("../studio-runner/test/fixtures/guided-tls/cert.fixture"))){req.setAttribute("jakarta.servlet.request.X509Certificate",new X509Certificate[]{(X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(in)});}
  var filter=new GuidedInternalSecurity.IdentityFilter(Base64.getEncoder().encodeToString(pair.getPublic().getEncoded()),"qa-issuer",true,Clock.systemUTC());
  assertThat(filter.authenticate(req).getName()).isEqualTo("worker");
  assertThat(new GuidedContracts().parse("{\"schemaVersion\":2} {} ").path("schemaVersion").asInt()).isEqualTo(2);
 }
 @Test void backendRejectsTheSameHour24AcceptedByNode() throws Exception {
  var fixtures=new ObjectMapper().readTree(Files.readString(Path.of("../docs/specs/studio-observed-authoring/contracts/v2/fixtures.json")));
  var assignment=(com.fasterxml.jackson.databind.node.ObjectNode)fixtures.path("documents").path("assignment").deepCopy();assignment.put("expiresAt","2026-10-08T24:00:00Z");
  assertThatThrownBy(()->new GuidedContracts().validate("v2/assignment",assignment)).isInstanceOf(GuidedSessionException.class);
 }
}
