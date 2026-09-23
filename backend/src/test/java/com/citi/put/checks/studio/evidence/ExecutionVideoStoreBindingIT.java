package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.15 AC-20, the half that needs a context — <b>the injected store really is the fake</b>.
 *
 * <p>Named from {@code ExecutionVideoExternallyGatedCriteriaTest}, which carries the rest of AC-20
 * and which deliberately needs no Docker. This one does, and that is stated rather than hidden: it
 * is the only AC-20 assertion that can be skipped by an environment.
 *
 * <p>Why it exists at all: AC-18b is recorded <i>skipped, never passed</i> because `ED-03` has not
 * provided a real Sonic endpoint. Somebody who wired a real client under the fake's bean name could
 * report that criterion cleared without the gate having moved — <i>"a b half that turns green
 * without its gate moving is a defect, not a bonus"</i>. This asserts the bean's actual type.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestEvidenceStores.class)
@Testcontainers(disabledWithoutDocker = true)
class ExecutionVideoStoreBindingIT {

  @Autowired private VideoObjectStore injected;

  @Test
  void theInjectedVideoStoreIsTheLocalFakeAndNotARealClient() {
    assertThat(injected)
        .as(
            "AC-18a ships the fake and AC-18b is blocked on ED-03; a real client wired under this "
                + "name would let a blocked criterion be reported as cleared")
        .isInstanceOf(FakeVideoObjectStore.class);
  }

  @Test
  void theFakeReallyIsAFakeAndNotAThinWrapperOverSomethingReachable() {
    FakeVideoObjectStore fake = (FakeVideoObjectStore) injected;
    fake.clear();

    assertThat(fake.metadata("studio/nothing/is/here.webm"))
        .as("an in-memory store answers immediately and holds only what a test put in it")
        .isEmpty();
    fake.put("studio/a/b/c/d.webm", new byte[] {1, 2, 3});
    assertThat(fake.metadata("studio/a/b/c/d.webm").orElseThrow().sizeBytes()).isEqualTo(3);
    fake.clear();
  }
}
