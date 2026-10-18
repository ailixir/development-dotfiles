package com.citi.put.checks.studio.dispatch;

import java.io.IOException;
import java.io.InputStream;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.CertificateExpiredException;
import java.security.cert.CertificateNotYetValidException;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import javax.net.ssl.KeyManager;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.TrustManager;
import javax.net.ssl.TrustManagerFactory;
import javax.net.ssl.X509TrustManager;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * The backend's one identity on the private Studio service plane, and the one trust anchor it
 * accepts there (STUDIO-OBS-009 AC-2, AC-3; architect rulings A4 and W1.5 part 2 section 3).
 *
 * <p>Four clients take their TLS from one instance of this class: the observed dispatch client, the
 * observed validation client, the guided runner client and the guided translation coordinator's
 * controller hop. The context is built only from the key store, trust store and password files
 * named in {@link Settings}. It never reads the JVM's process-wide TLS defaults: no {@code
 * javax.net.ssl.*} system property, no {@code cacerts}, and no platform default context. A tripwire
 * greps the studio sources for the JVM-default accessor and expects none.
 *
 * <p><b>One certificate, two roles.</b> The same key store is the backend's client certificate
 * toward the runner and the server certificate of the API pod's guided connector (the runner pins
 * one fingerprint for both, ruling part 1 section 1.5 c). It therefore needs {@code clientAuth} and
 * {@code serverAuth}; {@link #requireServerIdentity()} checks the second for the connector.
 *
 * <p><b>What it enforces.</b>
 *
 * <ul>
 *   <li>The key store holds exactly one private-key entry with an X.509 chain. Its leaf is inside
 *       its validity period and, when it carries an extended key usage, includes {@code
 *       clientAuth}. The backend authenticates to the runner with this certificate.
 *   <li>The trust store holds at least one trusted certificate entry and no private key. The runner
 *       must chain to one of them. The JDK HTTP client verifies the host name against the runner
 *       certificate's SANs (endpoint identification {@code HTTPS}); this class sets that
 *       explicitly.
 *   <li>Only TLS 1.3 and TLS 1.2 are offered.
 * </ul>
 *
 * <p><b>No settings, no trust.</b> {@link #unconfigured()} is the instance a context without
 * settings gets: no client certificate and an empty trust store, so every TLS handshake fails. It
 * exists so that a local or test context without a runner still builds, and it can never talk TLS
 * to anything. Outside the {@code local} and {@code test} profiles a configured runner hop without
 * settings does not start at all ({@link Wiring}).
 *
 * <p><b>Secrets.</b> Passwords come from files, are read once, and are zeroed after the stores are
 * loaded. A password, a key and a certificate body never appear in an exception message, a log line
 * or {@link #toString()}. Failure messages name the {@link Settings} component that is unusable
 * and, for a file problem, the file path (a path is configuration, not a secret).
 *
 * <p><b>Properties.</b> The deployment keys bind to {@link Settings} under {@code
 * studio.runner.tls}: {@code key-store}, {@code key-store-password-file}, {@code key-store-type},
 * {@code trust-store}, {@code trust-store-password-file} and {@code trust-store-type}. As
 * environment variables: {@code STUDIO_RUNNER_TLS_KEY_STORE} and so on, one per key.
 *
 * <p>Instances are immutable and thread-safe. A rotated certificate is picked up by a new instance,
 * which a pod restart provides; there is no in-process reload.
 */
public final class StudioRunnerTls {

  /** The key-store type used when {@link Settings} leaves a type blank. */
  public static final String DEFAULT_STORE_TYPE = "PKCS12";

  /** Protocols offered on the runner hop. */
  private static final String[] PROTOCOLS = {"TLSv1.3", "TLSv1.2"};

  /** Extended key usage OID for TLS client authentication (RFC 5280 4.2.1.12). */
  private static final String EKU_CLIENT_AUTH = "1.3.6.1.5.5.7.3.2";

  /** Extended key usage OID for TLS server authentication (RFC 5280 4.2.1.12). */
  private static final String EKU_SERVER_AUTH = "1.3.6.1.5.5.7.3.1";

  /**
   * File-based TLS configuration for the runner hop, bound from {@code studio.runner.tls}. Every
   * component is required once any is set; a blank type means {@value #DEFAULT_STORE_TYPE}.
   *
   * @param keyStore the store holding the backend's client certificate and private key
   * @param keyStorePasswordFile file whose content (trailing whitespace stripped) is the store and
   *     key password
   * @param keyStoreType store type, for example {@code PKCS12}
   * @param trustStore the store holding the certificate authority that issued the runner
   *     certificate
   * @param trustStorePasswordFile file whose content (trailing whitespace stripped) is the trust
   *     store password
   * @param trustStoreType store type, for example {@code PKCS12}
   */
  @ConfigurationProperties(prefix = "studio.runner.tls")
  public record Settings(
      Path keyStore,
      Path keyStorePasswordFile,
      String keyStoreType,
      Path trustStore,
      Path trustStorePasswordFile,
      String trustStoreType) {

    /**
     * Whether nothing is set. A deployment descriptor that renders an empty value for a key counts
     * as not set. The two type components do not count: they have a default, so a non-empty type
     * alone is not a configuration.
     *
     * @return true when no store and no password file is named
     */
    public boolean isEmpty() {
      return blank(keyStore)
          && blank(keyStorePasswordFile)
          && blank(trustStore)
          && blank(trustStorePasswordFile);
    }

    /**
     * Reads the key store password. The caller owns the array and zeroes it.
     *
     * @return the password, trailing whitespace stripped
     * @throws IllegalStateException when the file is not configured, unreadable or empty
     */
    public char[] readKeyStorePassword() {
      return readPassword("studio.runner.tls.key-store-password-file", keyStorePasswordFile);
    }

    /**
     * Reads the trust store password. The caller owns the array and zeroes it.
     *
     * @return the password, trailing whitespace stripped
     * @throws IllegalStateException when the file is not configured, unreadable or empty
     */
    public char[] readTrustStorePassword() {
      return readPassword("studio.runner.tls.trust-store-password-file", trustStorePasswordFile);
    }

    private static boolean blank(Path path) {
      return path == null || path.toString().isBlank();
    }
  }

  private final SSLContext context;
  private final SSLParameters parameters;
  private final String clientCertificateSubject;
  private final boolean serverAuthAllowed;

  private StudioRunnerTls(
      SSLContext context, String clientCertificateSubject, boolean serverAuthAllowed) {
    this.context = context;
    SSLParameters configured = new SSLParameters();
    configured.setProtocols(PROTOCOLS.clone());
    configured.setEndpointIdentificationAlgorithm("HTTPS");
    this.parameters = configured;
    this.clientCertificateSubject = clientCertificateSubject;
    this.serverAuthAllowed = serverAuthAllowed;
  }

  /**
   * The identity of a context that was given no settings: it presents no certificate and trusts
   * nothing, so every TLS handshake fails and only a plain {@code http://} URL can be used (which
   * the profile rule allows in {@code local} and {@code test} only). It reads no JVM default.
   *
   * @return a deny-all TLS identity; {@link #isConfigured()} is false
   */
  public static StudioRunnerTls unconfigured() {
    try {
      SSLContext built = SSLContext.getInstance("TLS");
      built.init(new KeyManager[0], new TrustManager[] {new DenyAllTrust()}, new SecureRandom());
      return new StudioRunnerTls(built, null, false);
    } catch (GeneralSecurityException failure) {
      throw new IllegalStateException(
          "studio.runner.tls could not build the deny-all context: "
              + failure.getClass().getSimpleName());
    }
  }

  /** Trusts no certificate for any purpose: the trust half of {@link #unconfigured()}. */
  private static final class DenyAllTrust implements X509TrustManager {
    @Override
    public void checkClientTrusted(X509Certificate[] chain, String authType)
        throws CertificateException {
      throw new CertificateException("studio.runner.tls is not configured");
    }

    @Override
    public void checkServerTrusted(X509Certificate[] chain, String authType)
        throws CertificateException {
      throw new CertificateException("studio.runner.tls is not configured");
    }

    @Override
    public X509Certificate[] getAcceptedIssuers() {
      return new X509Certificate[0];
    }
  }

  /**
   * The identity a context gets from its settings and profile. Outside the profiles that allow a
   * plaintext runner URL, a runner hop without settings is a startup failure, not a context that
   * silently trusts nothing.
   *
   * @param settings the bound {@code studio.runner.tls} values
   * @param plaintextAllowed true for the {@code local} and {@code test} profiles
   * @param runnerHopConfigured true when any backend-to-runner hop (dispatch, validation, guided
   *     bridge, translation controller, guided connector) is configured
   * @return the configured identity, or {@link #unconfigured()} when there is nothing to secure
   * @throws IllegalStateException when settings are partial or missing where they are required
   */
  public static StudioRunnerTls resolve(
      Settings settings, boolean plaintextAllowed, boolean runnerHopConfigured) {
    if (settings != null && !settings.isEmpty()) {
      return from(settings);
    }
    if (!plaintextAllowed && runnerHopConfigured) {
      throw new IllegalStateException(
          "studio.runner.tls is not configured: a runner hop is configured outside the "
              + "local and test profiles, and no key store or trust store was supplied "
              + "(studio.runner.tls.key-store, .key-store-password-file, .trust-store, "
              + ".trust-store-password-file)");
    }
    return unconfigured();
  }

  /**
   * Builds the dedicated context from files.
   *
   * @param settings the key store, trust store and password files
   * @return the TLS identity for the runner hop
   * @throws IllegalStateException when anything is missing or unusable; the message names the
   *     component, never a secret
   */
  public static StudioRunnerTls from(Settings settings) {
    if (settings == null) {
      throw new IllegalStateException("studio.runner.tls is not configured");
    }
    char[] keyPassword =
        readPassword("studio.runner.tls.key-store-password-file", settings.keyStorePasswordFile());
    char[] trustPassword = null;
    try {
      trustPassword =
          readPassword(
              "studio.runner.tls.trust-store-password-file", settings.trustStorePasswordFile());
      KeyStore keys =
          loadStore(
              "studio.runner.tls.key-store",
              settings.keyStore(),
              settings.keyStoreType(),
              keyPassword);
      KeyStore trust =
          loadStore(
              "studio.runner.tls.trust-store",
              settings.trustStore(),
              settings.trustStoreType(),
              trustPassword);
      return fromStores(keys, keyPassword, trust);
    } finally {
      Arrays.fill(keyPassword, '\0');
      if (trustPassword != null) {
        Arrays.fill(trustPassword, '\0');
      }
    }
  }

  /**
   * Builds the dedicated context from loaded stores. The caller keeps ownership of {@code
   * keyPassword}; it is not retained.
   *
   * @param keyStore a store with exactly one private-key entry
   * @param keyPassword the password of that key entry
   * @param trustStore a store with trusted certificate entries only
   * @return the TLS identity for the runner hop
   * @throws IllegalStateException when a store fails the checks in the class description
   */
  public static StudioRunnerTls fromStores(
      KeyStore keyStore, char[] keyPassword, KeyStore trustStore) {
    X509Certificate leaf = requireClientIdentity(keyStore);
    requireTrustAnchors(trustStore);
    try {
      KeyManagerFactory keys =
          KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
      keys.init(keyStore, keyPassword);
      TrustManagerFactory trust =
          TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
      trust.init(trustStore);
      SSLContext built = SSLContext.getInstance("TLS");
      built.init(keys.getKeyManagers(), trust.getTrustManagers(), new SecureRandom());
      return new StudioRunnerTls(
          built, leaf.getSubjectX500Principal().getName(), allowsServerAuth(leaf));
    } catch (GeneralSecurityException failure) {
      throw new IllegalStateException(
          "studio.runner.tls could not build a TLS context: " + failure.getClass().getSimpleName());
    }
  }

  /**
   * The dedicated context for {@link HttpClient.Builder#sslContext}, or for {@code
   * GuidedRunnerClient}'s constructor.
   *
   * @return the context built from {@link Settings} only
   */
  public SSLContext sslContext() {
    return context;
  }

  /**
   * The protocol and endpoint-identification parameters that go with {@link #sslContext()}.
   *
   * @return a fresh copy; callers may not change this instance's parameters
   */
  public SSLParameters sslParameters() {
    SSLParameters copy = new SSLParameters();
    copy.setProtocols(parameters.getProtocols());
    copy.setEndpointIdentificationAlgorithm(parameters.getEndpointIdentificationAlgorithm());
    return copy;
  }

  /**
   * Applies the context and parameters to a client builder. This is the one way the runner clients
   * take TLS from this class, so a client cannot end up with the context but not the host-name
   * check.
   *
   * @param builder the client builder to configure
   * @return {@code builder}
   */
  public HttpClient.Builder configure(HttpClient.Builder builder) {
    return builder.sslContext(context).sslParameters(sslParameters());
  }

  /**
   * Subject of the client certificate, for diagnostics. It is public certificate data.
   *
   * @return the subject, or {@code null} for {@link #unconfigured()}
   */
  public String clientCertificateSubject() {
    return clientCertificateSubject;
  }

  /**
   * Whether this identity was built from a key store and a trust store.
   *
   * @return false only for {@link #unconfigured()}
   */
  public boolean isConfigured() {
    return clientCertificateSubject != null;
  }

  /**
   * Checks the other half of the one-certificate-two-roles rule: the same leaf is the server
   * certificate of the API pod's guided connector, so it must allow {@code serverAuth} when it
   * carries an extended key usage at all.
   *
   * @return this identity
   * @throws IllegalStateException when the leaf is missing or does not allow {@code serverAuth}
   */
  public StudioRunnerTls requireServerIdentity() {
    if (!isConfigured()) {
      throw new IllegalStateException("studio.runner.tls is not configured");
    }
    if (!serverAuthAllowed) {
      throw new IllegalStateException(
          "studio.runner.tls.key-store certificate does not allow serverAuth, which the guided "
              + "connector needs (one backend certificate serves both roles)");
    }
    return this;
  }

  @Override
  public String toString() {
    return isConfigured()
        ? "StudioRunnerTls[clientCertificate=" + clientCertificateSubject + "]"
        : "StudioRunnerTls[unconfigured]";
  }

  private static boolean allowsServerAuth(X509Certificate leaf) {
    try {
      List<String> usage = leaf.getExtendedKeyUsage();
      return usage == null || usage.contains(EKU_SERVER_AUTH);
    } catch (java.security.cert.CertificateParsingException failure) {
      return false;
    }
  }

  private static char[] readPassword(String key, Path file) {
    if (file == null || file.toString().isBlank()) {
      throw new IllegalStateException(key + " is not configured");
    }
    byte[] raw;
    try {
      raw = Files.readAllBytes(file);
    } catch (IOException failure) {
      throw new IllegalStateException(key + " cannot be read: " + file);
    }
    try {
      String text = new String(raw, StandardCharsets.UTF_8).stripTrailing();
      if (text.isEmpty()) {
        throw new IllegalStateException(key + " is empty: " + file);
      }
      return text.toCharArray();
    } finally {
      Arrays.fill(raw, (byte) 0);
    }
  }

  private static KeyStore loadStore(String key, Path file, String type, char[] password) {
    if (file == null || file.toString().isBlank()) {
      throw new IllegalStateException(key + " is not configured");
    }
    String storeType = type == null || type.isBlank() ? DEFAULT_STORE_TYPE : type.strip();
    try (InputStream input = Files.newInputStream(file)) {
      KeyStore store = KeyStore.getInstance(storeType);
      store.load(input, password);
      return store;
    } catch (IOException | GeneralSecurityException failure) {
      // The cause text of a wrong password or a corrupt store can echo store content: omit it.
      throw new IllegalStateException(
          key + " cannot be loaded as " + storeType + ": " + file + " (" + reason(failure) + ")");
    }
  }

  private static String reason(Exception failure) {
    if (failure instanceof java.nio.file.NoSuchFileException) {
      return "file not found";
    }
    if (failure instanceof java.io.IOException io
        && io.getCause() instanceof java.security.UnrecoverableKeyException) {
      return "password rejected";
    }
    return failure.getClass().getSimpleName();
  }

  private static X509Certificate requireClientIdentity(KeyStore keyStore) {
    try {
      String found = null;
      for (String alias : Collections.list(keyStore.aliases())) {
        if (keyStore.isKeyEntry(alias)) {
          if (found != null) {
            throw new IllegalStateException(
                "studio.runner.tls.key-store must hold exactly one private-key entry");
          }
          found = alias;
        }
      }
      if (found == null) {
        throw new IllegalStateException(
            "studio.runner.tls.key-store holds no private-key entry (no client certificate)");
      }
      Certificate[] chain = keyStore.getCertificateChain(found);
      if (chain == null || chain.length == 0 || !(chain[0] instanceof X509Certificate leaf)) {
        throw new IllegalStateException(
            "studio.runner.tls.key-store entry has no X.509 certificate chain");
      }
      try {
        leaf.checkValidity();
      } catch (CertificateExpiredException | CertificateNotYetValidException failure) {
        throw new IllegalStateException(
            "studio.runner.tls.key-store client certificate is not within its validity period");
      }
      List<String> usage = leaf.getExtendedKeyUsage();
      if (usage != null && !usage.contains(EKU_CLIENT_AUTH)) {
        throw new IllegalStateException(
            "studio.runner.tls.key-store client certificate does not allow clientAuth");
      }
      return leaf;
    } catch (java.security.KeyStoreException
        | java.security.cert.CertificateParsingException failure) {
      throw new IllegalStateException(
          "studio.runner.tls.key-store is unusable: " + failure.getClass().getSimpleName());
    }
  }

  private static void requireTrustAnchors(KeyStore trustStore) {
    try {
      int anchors = 0;
      for (String alias : Collections.list(trustStore.aliases())) {
        if (trustStore.isKeyEntry(alias)) {
          throw new IllegalStateException(
              "studio.runner.tls.trust-store must hold certificates only, not a private key");
        }
        if (trustStore.isCertificateEntry(alias)) {
          anchors++;
        }
      }
      if (anchors == 0) {
        throw new IllegalStateException(
            "studio.runner.tls.trust-store holds no trusted certificate");
      }
    } catch (java.security.KeyStoreException failure) {
      throw new IllegalStateException("studio.runner.tls.trust-store is unusable");
    }
  }

  /**
   * Builds the one {@link StudioRunnerTls} bean from {@code studio.runner.tls} and the profile, and
   * applies the transport rule to {@code studio.runner.base-url}. Nested here because it is the
   * only place that knows both; component scanning registers it.
   */
  @Configuration(proxyBeanMethods = false)
  @EnableConfigurationProperties(Settings.class)
  public static class Wiring {

    /**
     * The identity every runner-facing client takes.
     *
     * @param settings the bound {@code studio.runner.tls} values
     * @param runner the runner endpoint configuration
     * @param environment the active profiles and the guided hop properties
     * @return the TLS identity; deny-all when there is nothing to secure
     * @throws IllegalStateException when a configured hop outside {@code local}/{@code test} has no
     *     settings, when settings are partial or unusable, or when a plaintext runner URL is
     *     configured outside those profiles
     */
    @Bean
    public StudioRunnerTls studioRunnerTls(
        Settings settings, StudioRunnerProperties runner, Environment environment) {
      boolean plaintextAllowed = StudioRunnerProperties.plaintextAllowed(environment);
      runner.validate(environment);
      return resolve(settings, plaintextAllowed, runnerHopConfigured(runner, environment));
    }

    private static boolean runnerHopConfigured(StudioRunnerProperties runner, Environment env) {
      return runner.isConfigured()
          || hasText(env, "studio.guided-authoring.runner-origin")
          || hasText(env, "studio.guided-authoring.translation.controller-origin")
          || env.getProperty("studio.guided-authoring.connector.port", Integer.class, 0) > 0;
    }

    private static boolean hasText(Environment env, String key) {
      String value = env.getProperty(key);
      return value != null && !value.isBlank();
    }
  }
}
