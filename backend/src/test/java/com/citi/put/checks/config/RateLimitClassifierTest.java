package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.config.RateLimitClassifier.BucketClass;
import com.citi.put.checks.studio.StudioController;
import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;

/**
 * Studio v1 WP6 (plan ADD-6): Studio execution requests are metered in the EXECUTE class.
 *
 * <p>The classifier used to match {@code /studio/tests/{id}/run}, a route no controller maps, so
 * every Studio execution fell through to WRITE. The path below is therefore built from {@link
 * StudioController}'s own mapping annotations, not typed out: a literal would keep passing if the
 * route were renamed again, which is exactly how the original mismatch survived.
 */
class RateLimitClassifierTest {

  private final RateLimitClassifier classifier = new RateLimitClassifier();

  @Test
  void theStudioExecuteRouteAsMappedIsClassifiedExecute() throws Exception {
    String path = mappedStudioExecutePath(UUID.randomUUID());

    assertThat(path).endsWith("/execute");
    assertThat(classifier.classify(request("POST", path))).isEqualTo(BucketClass.EXECUTE);
  }

  @Test
  void otherStudioWritesStayInTheWriteClass() {
    UUID id = UUID.randomUUID();

    assertThat(classifier.classify(request("POST", "/api/v1/studio/tests/" + id + "/compile")))
        .isEqualTo(BucketClass.WRITE);
    assertThat(classifier.classify(request("PUT", "/api/v1/studio/tests/" + id)))
        .isEqualTo(BucketClass.WRITE);
    assertThat(classifier.classify(request("POST", "/api/v1/studio/tests")))
        .isEqualTo(BucketClass.WRITE);
  }

  @Test
  void readingAStudioExecutionIsARead() {
    assertThat(
            classifier.classify(request("GET", "/api/v1/studio/executions/" + UUID.randomUUID())))
        .isEqualTo(BucketClass.READ);
  }

  @Test
  void checkExecutionIsStillExecute() {
    assertThat(
            classifier.classify(
                request("POST", "/api/v1/checks/" + UUID.randomUUID() + "/execute")))
        .isEqualTo(BucketClass.EXECUTE);
  }

  private static String mappedStudioExecutePath(UUID id) throws Exception {
    String base = StudioController.class.getAnnotation(RequestMapping.class).value()[0];
    Method execute =
        Arrays.stream(StudioController.class.getDeclaredMethods())
            .filter(method -> method.getName().equals("executeTest"))
            .findFirst()
            .orElseThrow(() -> new AssertionError("StudioController.executeTest is gone"));
    String route = execute.getAnnotation(PostMapping.class).value()[0];
    return base + route.replace("{id}", id.toString());
  }

  private static MockHttpServletRequest request(String method, String path) {
    MockHttpServletRequest request = new MockHttpServletRequest(method, path);
    request.setRequestURI(path);
    return request;
  }
}
