package com.citi.put.checks.studio.guided.session;

import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.dispatch.StudioRunnerProperties;
import com.citi.put.checks.studio.dispatch.StudioRunnerTls;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.InetAddress;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.IntSupplier;
import org.apache.catalina.connector.Connector;
import org.apache.coyote.http11.Http11NioProtocol;
import org.apache.tomcat.util.net.SSLHostConfig;
import org.apache.tomcat.util.net.SSLHostConfigCertificate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.web.embedded.tomcat.TomcatServletWebServerFactory;
import org.springframework.boot.web.server.WebServerFactoryCustomizer;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.Ordered;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
@EnableConfigurationProperties({GuidedSessionProperties.class, GuidedCsiBudgetProperties.class})
public class GuidedSessionConfiguration {
  @Bean
  GuidedContracts guidedContracts() {
    return new GuidedContracts();
  }

  /** The one public presentation (STUDIO-OBS-008 P2/P3), shared by the live and result views. */
  @Bean
  GuidedPublicPresentationProjector guidedPublicPresentationProjector(
      JdbcTemplate jdbc, GuidedContracts contracts) {
    return new GuidedPublicPresentationProjector(jdbc, contracts);
  }

  @Bean
  GuidedSessionRepository guidedSessionRepository(
      JdbcTemplate jdbc, PlatformTransactionManager manager, GuidedContracts contracts) {
    return new GuidedSessionRepository(jdbc, new TransactionTemplate(manager), contracts);
  }

  @Bean
  GuidedCsiBudget guidedCsiBudget(
      JdbcTemplate jdbc, GuidedCsiBudgetProperties budget, GuidedSessionProperties session) {
    budget.requireFits(session);
    return new GuidedCsiBudget(jdbc, budget);
  }

  @Bean
  GuidedSessionService guidedSessionService(
      GuidedSessionRepository repository,
      GuidedContracts contracts,
      GuidedSessionAccess access,
      GuidedSessionProperties properties,
      JdbcTemplate jdbc,
      com.citi.put.checks.studio.guided.translation.GuidedTranslationStore translation,
      com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore questions,
      com.citi.put.checks.studio.secrets.SecretRevocationSweep revocation,
      com.citi.put.checks.studio.secrets.SecretAuditLifecycle audit,
      com.citi.put.checks.studio.StudioExecutionProperties execution,
      com.citi.put.checks.studio.guided.policy.ObservationPolicyService policies,
      GuidedCsiBudget csiBudget,
      GuidedPublicPresentationProjector presentation,
      org.springframework.beans.factory.ObjectProvider<
              com.citi.put.checks.studio.guided.publication.ObservedRevisionVerifier>
          verifier) {
    var service =
        new GuidedSessionService(repository, contracts, access, properties, Clock.systemUTC());
    var materialization =
        new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(jdbc, contracts);
    service.installBridge(
        materialization,
        new com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore(jdbc, contracts),
        new com.citi.put.checks.studio.guided.bridge.GuidedBindingStore(
            jdbc, contracts, materialization),
        new com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore(jdbc, contracts));
    service.installTranslation(translation, questions);
    service.installSecretRevocation(revocation);
    service.installSecretAudit(audit);
    service.installExecutionEnabled(execution::enabledOrDefault);
    service.installGovernance(policies, csiBudget);
    service.installPresentation(presentation);
    service.installIncrementalVerifier(revision -> verifier.getObject().verify(revision));
    revocation.installGuidedStop(service::secretRevoked);
    return service;
  }

  @Bean
  com.citi.put.checks.studio.guided.bridge.GuidedDispatchService guidedDispatchService(
      GuidedSessionService sessions,
      com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient runner,
      JdbcTemplate jdbc,
      GuidedContracts contracts,
      com.citi.put.checks.studio.dispatch.StudioReferenceResolver references) {
    var dispatch =
        new com.citi.put.checks.studio.guided.bridge.GuidedDispatchService(
            sessions,
            new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(
                jdbc, contracts),
            runner);
    dispatch.installReferences(references);
    sessions.installStopSender(dispatch::stop);
    return dispatch;
  }

  @Bean
  @ConditionalOnMissingBean(GuidedSessionAccess.class)
  GuidedSessionAccess guidedProductionAccess(
      com.citi.put.checks.studio.guided.translation.GuidedSourceSnapshotRepository snapshots,
      com.citi.put.checks.studio.guided.translation.GuidedSourceClassifier classifier,
      com.citi.put.checks.studio.guided.translation.GuidedSourceInputResolver resolver,
      com.citi.put.checks.studio.guided.translation.GuidedTranslationStore store,
      com.citi.put.checks.studio.guided.translation.GuidedStepVerifier verifier,
      CsiOwnershipEvaluator ownership,
      com.citi.put.checks.studio.guided.publication.ObservedReplayPins pins,
      com.citi.put.checks.studio.dispatch.StudioReferenceResolver references,
      com.citi.put.checks.studio.secrets.StudioSecretUseAuthorization secretUse) {
    return new com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess(
        snapshots, classifier, resolver, store, verifier, ownership, pins, references, secretUse);
  }

  /**
   * The guided mutual-TLS chain fails closed at startup (STUDIO-OBS-009 AC-2). Outside the {@code
   * local} and {@code test} profiles, a deployment that wires any guided hop must supply every part
   * of the chain, or the pod does not start:
   *
   * <ul>
   *   <li>the API role ({@code !worker}): {@code mtls-required=true}, the pinned {@code
   *       service-public-key}, the {@code service-issuer} and the guided connector port, because
   *       {@link GuidedInternalSecurity} authenticates every internal call with the three together
   *       and the connector is the only place a client certificate can arrive;
   *   <li>the bridge to the runner: the controller token file;
   *   <li>the translation controller hop: its token file.
   * </ul>
   *
   * The backend's own key store and trust store are checked by {@link StudioRunnerTls.Wiring},
   * which treats the same hops as configured. Per request, {@link GuidedInternalSecurity} still
   * answers 401 when any part is absent, so the startup check adds an early failure and removes no
   * protection.
   */
  @Configuration(proxyBeanMethods = false)
  public static class MtlsChain {

    /** Marker for the completed check; carries no behaviour. */
    public static final class Checked {}

    /**
     * Fails the context when the chain is incomplete.
     *
     * @param environment the active profiles and guided properties
     * @return a marker bean, so the check runs at startup
     */
    @Bean
    Checked guidedMtlsChainChecked(Environment environment) {
      List<String> problems = problems(environment);
      if (!problems.isEmpty()) {
        throw new IllegalStateException(
            "The guided mutual-TLS chain is incomplete: " + String.join("; ", problems));
      }
      return new Checked();
    }

    /**
     * Every missing part of the chain for this environment; empty in the {@code local} and {@code
     * test} profiles and where no guided hop is configured.
     *
     * @param environment the active profiles and guided properties
     * @return one message per missing part, naming the property to set
     */
    public static List<String> problems(Environment environment) {
      List<String> problems = new ArrayList<>();
      if (StudioRunnerProperties.plaintextAllowed(environment)) {
        return problems;
      }
      boolean runnerHop = has(environment, "studio.guided-authoring.runner-origin");
      boolean controllerHop =
          has(environment, "studio.guided-authoring.translation.controller-origin");
      int connectorPort = connectorPort(environment);
      if (!runnerHop && !controllerHop && connectorPort <= 0) {
        return problems;
      }
      if (!environment.acceptsProfiles(org.springframework.core.env.Profiles.of("worker"))) {
        if (!environment.getProperty(
            "studio.guided-authoring.mtls-required", Boolean.class, false)) {
          problems.add("studio.guided-authoring.mtls-required must be true");
        }
        if (!has(environment, "studio.guided-authoring.service-public-key")) {
          problems.add("studio.guided-authoring.service-public-key is not set");
        }
        if (!has(environment, "studio.guided-authoring.service-issuer")) {
          problems.add("studio.guided-authoring.service-issuer is not set");
        }
        if (connectorPort <= 0) {
          problems.add("studio.guided-authoring.connector.port is not set (no TLS connector)");
        }
      }
      if (runnerHop && !has(environment, "studio.guided-authoring.controller-token-file")) {
        problems.add("studio.guided-authoring.controller-token-file is not set");
      }
      if (controllerHop
          && !has(environment, "studio.guided-authoring.translation.controller-token-file")) {
        problems.add("studio.guided-authoring.translation.controller-token-file is not set");
      }
      return problems;
    }

    private static boolean has(Environment environment, String key) {
      String value = environment.getProperty(key);
      return value != null && !value.isBlank();
    }

    private static int connectorPort(Environment environment) {
      return environment.getProperty("studio.guided-authoring.connector.port", Integer.class, 0);
    }
  }

  /**
   * The API pod's guided TLS connector (STUDIO-OBS-009 AC-2; @devops co-sign section 3.1). {@link
   * GuidedInternalSecurity} needs a client certificate on the request, and only a connector that
   * demands one can supply it, so the runner's and the worker's calls to {@code
   * /internal/v2/studio/guided-sessions/**} arrive here and not through the Ingress or the plain
   * HTTP port.
   *
   * <p>It serves the backend's one certificate ({@link StudioRunnerTls}): the same key store the
   * backend presents to the runner, which therefore needs {@code serverAuth} as well as {@code
   * clientAuth}, with SANs for the host the runner's {@code GUIDED_CALLBACK_BASE_URL} and the
   * coordinator's {@code controller-origin} name. A client certificate is required and must chain
   * to the configured trust store; TLS 1.2 and 1.3 only. Absent on a worker, which has no internal
   * chain, and absent when {@code studio.guided-authoring.connector.port} is 0.
   *
   * <p>The connector serves only {@code /internal/v2/studio/guided-sessions/**}: {@link
   * ConnectorScope} refuses every other path on this port, ahead of Spring Security (pre-F-merge
   * ruling item 4(i)a). The client certificate is the transport gate, and the connector adds no
   * reach to the rest of the servlet application.
   */
  @Configuration(proxyBeanMethods = false)
  @Profile("!worker")
  public static class GuidedTlsConnector {

    /**
     * The path scope of the guided connector, registered ahead of Spring Security. It is inert
     * until the customizer attaches a connector, so it changes nothing when no port is configured.
     *
     * @return the registration; the filter sees every request on every port and decides by port
     */
    @Bean
    FilterRegistrationBean<ConnectorScope> guidedConnectorScope() {
      FilterRegistrationBean<ConnectorScope> registration =
          new FilterRegistrationBean<>(new ConnectorScope());
      registration.addUrlPatterns("/*");
      registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
      return registration;
    }

    /**
     * Adds the connector to the embedded server when a port is configured.
     *
     * @param environment where the port comes from
     * @param settings the backend key store and trust store
     * @param tls the validated identity; its leaf must allow {@code serverAuth}
     * @param scope the path scope, told which connector it guards
     * @return the customizer; a no-op when no port is configured
     */
    @Bean
    WebServerFactoryCustomizer<TomcatServletWebServerFactory> guidedTlsConnectorCustomizer(
        Environment environment,
        StudioRunnerTls.Settings settings,
        StudioRunnerTls tls,
        FilterRegistrationBean<ConnectorScope> scope) {
      int port =
          environment.getProperty("studio.guided-authoring.connector.port", Integer.class, 0);
      if (port <= 0) {
        return GuidedTlsConnector::noConnector;
      }
      tls.requireServerIdentity();
      return factory -> {
        Connector connector = connector(port, settings);
        Binder.get(environment)
            .bind("server.address", InetAddress.class)
            .ifBound(
                address ->
                    ((Http11NioProtocol) connector.getProtocolHandler()).setAddress(address));
        scope.getFilter().attach(connector);
        factory.addAdditionalTomcatConnectors(connector);
      };
    }

    private static void noConnector(TomcatServletWebServerFactory factory) {
      // No port configured: the embedded server keeps only its own connector.
    }

    /**
     * The connector: HTTPS, client certificate required, trust from the configured trust store.
     *
     * @param port the listening port; 0 picks a free one (tests)
     * @param settings the backend key store and trust store, with their password files
     * @return an unstarted connector
     */
    public static Connector connector(int port, StudioRunnerTls.Settings settings) {
      char[] keyPassword = settings.readKeyStorePassword();
      char[] trustPassword = settings.readTrustStorePassword();
      try {
        Connector connector = new Connector(Http11NioProtocol.class.getName());
        connector.setPort(port);
        connector.setScheme("https");
        connector.setSecure(true);
        SSLHostConfig host = new SSLHostConfig();
        host.setProtocols("TLSv1.2,TLSv1.3");
        host.setCertificateVerification("required");
        host.setTruststoreFile(settings.trustStore().toString());
        host.setTruststorePassword(new String(trustPassword));
        host.setTruststoreType(storeType(settings.trustStoreType()));
        SSLHostConfigCertificate certificate =
            new SSLHostConfigCertificate(host, SSLHostConfigCertificate.Type.UNDEFINED);
        certificate.setCertificateKeystoreFile(settings.keyStore().toString());
        certificate.setCertificateKeystorePassword(new String(keyPassword));
        certificate.setCertificateKeystoreType(storeType(settings.keyStoreType()));
        host.addCertificate(certificate);
        Http11NioProtocol protocol = (Http11NioProtocol) connector.getProtocolHandler();
        protocol.setSSLEnabled(true);
        protocol.addSslHostConfig(host);
        return connector;
      } finally {
        Arrays.fill(keyPassword, '\0');
        Arrays.fill(trustPassword, '\0');
      }
    }

    /**
     * Refuses every request that arrives on the guided connector unless it targets {@code
     * /internal/v2/studio/guided-sessions/}. The check is by the port the request arrived on, which
     * the started connector reports, so it works with port 0 in tests; the plain port is never
     * touched.
     *
     * <p>A request passes only if both the raw request URI (before any decoding) and the
     * container-resolved servlet path plus path info start with the prefix, and the raw URI carries
     * no dot segment, path parameter, encoded dot, encoded slash or encoded backslash. Anything
     * else gets {@code 404} with an empty body and no {@code WWW-Authenticate}, and nothing after
     * this filter runs. A connector that reports no positive local port refuses everything: the
     * filter cannot then tell which requests came through it.
     */
    public static final class ConnectorScope extends OncePerRequestFilter {
      /** The only path the guided connector serves. */
      public static final String GUIDED_PREFIX = "/internal/v2/studio/guided-sessions/";

      private static final List<String> FORBIDDEN_IN_RAW_URI =
          List.of("..", ";", "%2e", "%2E", "%2f", "%2F", "%5c", "%5C");

      private volatile IntSupplier connectorPort;

      /** An inert scope: with no connector attached it passes every request. */
      public ConnectorScope() {
        this.connectorPort = null;
      }

      /**
       * Guards {@code connector}: its local port is read per request, so it is known once started.
       *
       * @param connector the guided connector the customizer created
       */
      void attach(Connector connector) {
        attach(connector::getLocalPort);
      }

      /**
       * Guards the port this supplier reports.
       *
       * @param localPort the guarded connector's local port; not positive until it is bound
       */
      public void attach(IntSupplier localPort) {
        this.connectorPort = localPort;
      }

      @Override
      protected void doFilterInternal(
          HttpServletRequest request, HttpServletResponse response, FilterChain chain)
          throws ServletException, IOException {
        IntSupplier guarded = connectorPort;
        if (guarded == null) {
          chain.doFilter(request, response);
          return;
        }
        int connector = guarded.getAsInt();
        if (connector > 0 && request.getLocalPort() != connector) {
          chain.doFilter(request, response);
          return;
        }
        if (connector > 0 && servesGuidedPath(request)) {
          chain.doFilter(request, response);
          return;
        }
        response.setStatus(HttpServletResponse.SC_NOT_FOUND);
        response.setContentLength(0);
        response.flushBuffer();
      }

      private static boolean servesGuidedPath(HttpServletRequest request) {
        String raw = request.getRequestURI();
        String context = request.getContextPath();
        if (raw == null) {
          return false;
        }
        if (context != null && !context.isEmpty() && raw.startsWith(context)) {
          raw = raw.substring(context.length());
        }
        if (!raw.startsWith(GUIDED_PREFIX)) {
          return false;
        }
        for (String forbidden : FORBIDDEN_IN_RAW_URI) {
          if (raw.contains(forbidden)) {
            return false;
          }
        }
        String info = request.getPathInfo();
        String resolved =
            (request.getServletPath() == null ? "" : request.getServletPath())
                + (info == null ? "" : info);
        return resolved.startsWith(GUIDED_PREFIX);
      }
    }

    private static String storeType(String configured) {
      return configured == null || configured.isBlank()
          ? StudioRunnerTls.DEFAULT_STORE_TYPE
          : configured.strip();
    }
  }
}
