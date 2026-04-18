package com.citi.put.checks.users;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class UserMeEndpointIT {

  private static final String IDENTITY_JSON =
      """
      {
        "user_id": "me-test-user",
        "email": "metest@citi.com",
        "name": "Me Test",
        "department": "Engineering",
        "roles": ["checks-operator"],
        "csi_ownership": []
      }
      """;

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;
  @Autowired UserProvisioningService provisioningService;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    wireMock.stubFor(get(urlEqualTo("/api/v1/users/me")).willReturn(okJson(IDENTITY_JSON)));
  }

  @Test
  void usersMeReturnsProvisionedMirrorRow() throws Exception {
    com.citi.put.checks.security.UserIdentity identity =
        new com.citi.put.checks.security.UserIdentity(
            "me-test-user",
            "metest@citi.com",
            "Me Test",
            "Engineering",
            List.of("checks-operator"),
            List.of());
    provisioningService.provisionOrTouch(identity);

    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=me-test-token");
    ResponseEntity<String> response =
        restTemplate.exchange(
            "/api/v1/users/me", HttpMethod.GET, new HttpEntity<>(headers), String.class);

    assertThat(response.getStatusCode().value()).isEqualTo(200);
    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("ssoId").asText()).isEqualTo("me-test-user");
    assertThat(body.path("email").asText()).isEqualTo("metest@citi.com");
  }

  @Test
  void controllerReturns404WithRetryAfterWhenUserNotProvisioned() {
    UsersController controller =
        new UsersController(
            new UserRepository() {
              @Override
              public Optional<com.citi.put.checks.users.entity.User> findBySsoId(String ssoId) {
                return Optional.empty();
              }

              @Override
              public Optional<com.citi.put.checks.users.entity.User> findByEmail(String email) {
                return Optional.empty();
              }

              // remaining JpaRepository methods unused
              public java.util.List<com.citi.put.checks.users.entity.User> findAll() {
                return List.of();
              }

              public <S extends com.citi.put.checks.users.entity.User> S save(S s) {
                return s;
              }

              public java.util.List<com.citi.put.checks.users.entity.User> findAll(
                  org.springframework.data.domain.Sort s) {
                return List.of();
              }

              public org.springframework.data.domain.Page<com.citi.put.checks.users.entity.User>
                  findAll(org.springframework.data.domain.Pageable p) {
                return org.springframework.data.domain.Page.empty();
              }

              public java.util.List<com.citi.put.checks.users.entity.User> findAllById(
                  Iterable<java.util.UUID> i) {
                return List.of();
              }

              public long count() {
                return 0;
              }

              public void deleteById(java.util.UUID id) {}

              public void delete(com.citi.put.checks.users.entity.User u) {}

              public void deleteAllById(Iterable<? extends java.util.UUID> i) {}

              public void deleteAll(Iterable<? extends com.citi.put.checks.users.entity.User> e) {}

              public void deleteAll() {}

              public <S extends com.citi.put.checks.users.entity.User> java.util.List<S> saveAll(
                  Iterable<S> e) {
                return List.of();
              }

              public Optional<com.citi.put.checks.users.entity.User> findById(java.util.UUID id) {
                return Optional.empty();
              }

              public boolean existsById(java.util.UUID id) {
                return false;
              }

              public void flush() {}

              public <S extends com.citi.put.checks.users.entity.User> S saveAndFlush(S s) {
                return s;
              }

              public <S extends com.citi.put.checks.users.entity.User>
                  java.util.List<S> saveAllAndFlush(Iterable<S> e) {
                return List.of();
              }

              public void deleteAllInBatch(Iterable<com.citi.put.checks.users.entity.User> e) {}

              public void deleteAllByIdInBatch(Iterable<java.util.UUID> i) {}

              public void deleteAllInBatch() {}

              public com.citi.put.checks.users.entity.User getOne(java.util.UUID id) {
                return null;
              }

              public com.citi.put.checks.users.entity.User getById(java.util.UUID id) {
                return null;
              }

              public com.citi.put.checks.users.entity.User getReferenceById(java.util.UUID id) {
                return null;
              }

              public <S extends com.citi.put.checks.users.entity.User> Optional<S> findOne(
                  org.springframework.data.domain.Example<S> e) {
                return Optional.empty();
              }

              public <S extends com.citi.put.checks.users.entity.User> java.util.List<S> findAll(
                  org.springframework.data.domain.Example<S> e) {
                return List.of();
              }

              public <S extends com.citi.put.checks.users.entity.User> java.util.List<S> findAll(
                  org.springframework.data.domain.Example<S> e,
                  org.springframework.data.domain.Sort s) {
                return List.of();
              }

              public <S extends com.citi.put.checks.users.entity.User>
                  org.springframework.data.domain.Page<S> findAll(
                      org.springframework.data.domain.Example<S> e,
                      org.springframework.data.domain.Pageable p) {
                return org.springframework.data.domain.Page.empty();
              }

              public <S extends com.citi.put.checks.users.entity.User> long count(
                  org.springframework.data.domain.Example<S> e) {
                return 0;
              }

              public <S extends com.citi.put.checks.users.entity.User> boolean exists(
                  org.springframework.data.domain.Example<S> e) {
                return false;
              }

              public <S extends com.citi.put.checks.users.entity.User, R> R findBy(
                  org.springframework.data.domain.Example<S> ex,
                  java.util.function.Function<
                          org.springframework.data.repository.query.FluentQuery
                                  .FetchableFluentQuery<
                              S>,
                          R>
                      fn) {
                return null;
              }
            });

    com.citi.put.checks.security.UserIdentity identity =
        new com.citi.put.checks.security.UserIdentity(
            "ghost", "ghost@citi.com", "Ghost", null, List.of(), List.of());

    ResponseEntity<?> response = controller.me(identity);
    assertThat(response.getStatusCode().value()).isEqualTo(404);
    assertThat(response.getHeaders().getFirst("Retry-After")).isEqualTo("2");
  }
}
