package com.citi.put.checks.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class CsiOwnershipEvaluatorTest {

    private final CsiOwnershipEvaluator evaluator = new CsiOwnershipEvaluator();

    private BffAuthenticationToken tokenFor(List<String> roles, List<CsiOwnershipEntry> csi) {
        return new BffAuthenticationToken(
            new UserIdentity("user@citi.com", "user@citi.com", "User", "Ops", roles, csi));
    }

    @Test
    void adminBypassesAllOwnershipChecks() {
        var token = tokenFor(List.of("checks-admin"), List.of());
        assertThat(evaluator.isAdmin(token)).isTrue();
        assertThat(evaluator.canRead(token, "999")).isTrue();
        assertThat(evaluator.canWrite(token, "999")).isTrue();
        assertThat(evaluator.canExecute(token, "999")).isTrue();
    }

    @Test
    void platformAdminBypassesOwnershipChecks() {
        var token = tokenFor(List.of("platform-admin"), List.of());
        assertThat(evaluator.isAdmin(token)).isTrue();
        assertThat(evaluator.canRead(token, "999")).isTrue();
    }

    @Test
    void ownerCanReadWriteExecute() {
        var token = tokenFor(List.of("checks-operator"),
            List.of(new CsiOwnershipEntry("100", "owner")));
        assertThat(evaluator.canRead(token, "100")).isTrue();
        assertThat(evaluator.canWrite(token, "100")).isTrue();
        assertThat(evaluator.canExecute(token, "100")).isTrue();
    }

    @Test
    void contributorCanReadButNotWrite() {
        var token = tokenFor(List.of("checks-operator"),
            List.of(new CsiOwnershipEntry("100", "contributor")));
        assertThat(evaluator.canRead(token, "100")).isTrue();
        assertThat(evaluator.canWrite(token, "100")).isFalse();
        assertThat(evaluator.canExecute(token, "100")).isFalse();
    }

    @Test
    void viewerCanReadButNotWrite() {
        var token = tokenFor(List.of("checks-operator"),
            List.of(new CsiOwnershipEntry("100", "viewer")));
        assertThat(evaluator.canRead(token, "100")).isTrue();
        assertThat(evaluator.canWrite(token, "100")).isFalse();
    }

    @Test
    void noOwnershipDeniesAll() {
        var token = tokenFor(List.of("checks-operator"), List.of());
        assertThat(evaluator.isAdmin(token)).isFalse();
        assertThat(evaluator.canRead(token, "100")).isFalse();
        assertThat(evaluator.canWrite(token, "100")).isFalse();
    }

    @Test
    void wrongCsiIdDeniesAccess() {
        var token = tokenFor(List.of("checks-operator"),
            List.of(new CsiOwnershipEntry("100", "owner")));
        assertThat(evaluator.canRead(token, "999")).isFalse();
        assertThat(evaluator.canWrite(token, "999")).isFalse();
    }
}
