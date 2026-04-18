package com.citi.put.checks.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SchemaValidatorsConfig;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.io.InputStream;
import java.util.Set;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class CoreContractComplianceTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static JsonSchema usersMeSchema;
    private static JsonSchema authzCheckSchema;
    private static FakeCoreServiceClient client;

    @BeforeAll
    static void loadSchemas() {
        JsonSchemaFactory factory =
                JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012);

        usersMeSchema = factory.getSchema(loadResource("/contracts/users-me.schema.json"));
        authzCheckSchema = factory.getSchema(loadResource("/contracts/authz-check.schema.json"));
        client = new FakeCoreServiceClient();
    }

    @Test
    void usersMeResponseValidatesAgainstSchema() throws Exception {
        JsonNode payload = MAPPER.readTree(client.getUsersMe());
        Set<ValidationMessage> errors = usersMeSchema.validate(payload);
        assertThat(errors)
                .as("FakeCoreServiceClient.getUsersMe() should validate against users-me schema")
                .isEmpty();
    }

    @Test
    void usersMeAdminResponseValidatesAgainstSchema() throws Exception {
        JsonNode payload = MAPPER.readTree(client.getUsersMeAdmin());
        Set<ValidationMessage> errors = usersMeSchema.validate(payload);
        assertThat(errors)
                .as("FakeCoreServiceClient.getUsersMeAdmin() should validate against users-me schema")
                .isEmpty();
    }

    @Test
    void authzCheckAllowedValidatesAgainstSchema() throws Exception {
        JsonNode payload = MAPPER.readTree(client.checkAuthorizationAllowed());
        Set<ValidationMessage> errors = authzCheckSchema.validate(payload);
        assertThat(errors)
                .as("Allowed authz response should validate against authz-check schema")
                .isEmpty();
    }

    @Test
    void authzCheckDeniedValidatesAgainstSchema() throws Exception {
        JsonNode payload = MAPPER.readTree(client.checkAuthorizationDenied());
        Set<ValidationMessage> errors = authzCheckSchema.validate(payload);
        assertThat(errors)
                .as("Denied authz response should validate against authz-check schema")
                .isEmpty();
    }

    @Test
    void usersMeResponseContainsRequiredFields() throws Exception {
        JsonNode payload = MAPPER.readTree(client.getUsersMe());
        assertThat(payload.has("user_id")).isTrue();
        assertThat(payload.has("email")).isTrue();
        assertThat(payload.has("name")).isTrue();
        assertThat(payload.has("roles")).isTrue();
        assertThat(payload.get("roles").isArray()).isTrue();
        assertThat(payload.has("csi_ownership")).isTrue();
        assertThat(payload.get("csi_ownership").isArray()).isTrue();
        assertThat(payload.get("csi_ownership").size()).isGreaterThan(0);
    }

    @Test
    void csiOwnershipEntryHasRequiredShape() throws Exception {
        JsonNode payload = MAPPER.readTree(client.getUsersMe());
        JsonNode firstEntry = payload.get("csi_ownership").get(0);
        assertThat(firstEntry.has("csi_id")).isTrue();
        assertThat(firstEntry.has("role")).isTrue();
        assertThat(firstEntry.get("role").asText()).isIn("owner", "contributor", "viewer");
    }

    private static InputStream loadResource(String path) {
        InputStream is = CoreContractComplianceTest.class.getResourceAsStream(path);
        if (is == null) {
            throw new IllegalStateException("Schema resource not found: " + path);
        }
        return is;
    }
}
