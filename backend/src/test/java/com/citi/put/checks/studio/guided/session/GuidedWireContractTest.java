package com.citi.put.checks.studio.guided.session;

import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.file.Files;
import java.nio.file.Path;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.Test;

class GuidedWireContractTest {
  private final GuidedContracts contracts = new GuidedContracts();

  @Test
  void frozenDateTimeOracleMatchesOnEnforcedAssignmentSchema() throws Exception {
    var fixtures =
        contracts.parse(
            Files.readString(
                Path.of("../docs/specs/studio-observed-authoring/contracts/v2/fixtures.json")));
    var parity =
        contracts.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v2/wire-parity.fixtures.json")));
    var softly = new SoftAssertions();
    for (var vector : parity.path("dateTimes")) {
      ObjectNode assignment = fixtures.path("documents").path("assignment").deepCopy();
      assignment.put("expiresAt", vector.path("value").asText());
      boolean accepted;
      try {
        contracts.validate("v2/assignment", assignment);
        accepted = true;
      } catch (GuidedSessionException failure) {
        accepted = false;
      }
      softly
          .assertThat(accepted)
          .as(vector.path("value").asText())
          .isEqualTo(vector.path("accepted").asBoolean());
    }
    softly.assertAll();
  }

  @Test
  void rawByteVectorsRejectAmbiguityBeforeParsingCanDiscardIt() throws Exception {
    var vectors =
        contracts.parse(
            Files.readString(
                Path.of(
                    "../docs/specs/studio-observed-authoring/contracts/v2/wire-parity.fixtures.json")));
    var softly = new SoftAssertions();
    for (var vector : vectors.path("rawJson")) {
      boolean accepted;
      try {
        contracts.parseWire(java.util.Base64.getDecoder().decode(vector.path("base64").asText()));
        accepted = true;
      } catch (GuidedSessionException failure) {
        accepted = false;
      }
      softly
          .assertThat(accepted)
          .as(vector.path("name").asText())
          .isEqualTo(vector.path("accepted").asBoolean());
    }
    softly.assertAll();
  }

  @Test
  void textualPersistenceParserAlsoRejectsDuplicatesAndTrailingObjects() {
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> contracts.parse("{\"a\":1,\"a\":2}"))
        .hasMessage("INVALID_CONTRACT");
    org.assertj.core.api.Assertions.assertThatThrownBy(() -> contracts.parse("{} {}"))
        .hasMessage("INVALID_CONTRACT");
  }

  @Test
  void absentSchemaDefinitionNeverBecomesAnEmptyPermissiveSchema() {
    org.assertj.core.api.Assertions.assertThatThrownBy(
            () -> contracts.validate("v2/bridge#/definitions/missing", contracts.object()))
        .hasMessage("RUNTIME_INCOMPATIBLE");
  }
}
