package com.citi.put.checks.studio.support;

import com.citi.put.checks.studio.dispatch.StudioRunnerTls;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.GeneralSecurityException;
import java.security.Key;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;

/**
 * The one test certificate authority for every STUDIO-OBS-009 test that talks TLS between the
 * backend and the {@code studio-runner}: lane I ({@link RunnerProcessHarness}) and lane D3 ({@link
 * StudioRunnerTls}). Test material only; none of it is ever read by production code.
 *
 * <p><b>What it builds</b> (RSA 2048, valid two days, generated with the JDK's own {@code keytool}
 * so no third-party crypto library and no {@code openssl} is needed):
 *
 * <ul>
 *   <li>{@link Identity#RUNNER}: the runner's server certificate. Extended key usage {@code
 *       serverAuth} and {@code clientAuth}, because the runner's own probe presents it (ruling A3).
 *       SANs: {@code localhost}, {@code 127.0.0.1}, {@code ::1}.
 *   <li>{@link Identity#BACKEND}: the backend's one certificate, {@code serverAuth} and {@code
 *       clientAuth}, SANs {@code localhost}, {@code 127.0.0.1}, {@code ::1}. It is the client
 *       certificate the runner pins as "the controller" and, with the same fingerprint, the server
 *       certificate of the API pod's guided connector that the runner's callbacks pin (ruling W1.5
 *       part 1 section 1.5 c).
 *   <li>{@link Identity#ROGUE}: a self-signed client certificate that does <em>not</em> chain to
 *       the CA. It is the negative control: a runner or backend that accepts it is broken.
 * </ul>
 *
 * <p><b>Files</b> (all under the directory passed to {@link #create(Path)}; private files are mode
 * 0600 where the file system supports it):
 *
 * <ul>
 *   <li>{@code ca.pem}: the CA certificate, to hand to the runner as its client-CA bundle.
 *   <li>per identity {@code <name>.crt} (leaf then CA, PEM), {@code <name>.key} (PKCS#8 PEM),
 *       {@code <name>.p12} (key entry and chain) and {@code <name>.p12.pass}.
 *   <li>{@code ca.p12} and its password file stay in the directory so {@link #issueVariant} can
 *       mint extra leaves on demand.
 *   <li>{@code truststore.p12} with the CA only (and {@code truststore.p12.pass}); {@code
 *       rogue-truststore.p12} with the rogue certificate only, for "this peer is not trusted"
 *       cases.
 * </ul>
 *
 * <p>Passwords are random per instance, live only in those files, and are never logged or exposed
 * by accessors. {@link #toString()} lists no path and no secret.
 *
 * <p>Generation spawns a handful of {@code keytool} processes (about 3 s), so {@link #shared()}
 * builds one instance per JVM and reuses it; callers that need to own the files use {@link
 * #create(Path)}.
 */
public final class RunnerTestTls {

  /** The three identities this CA hands out. */
  public enum Identity {
    /** The runner's server (and probe-client) certificate, issued by the CA. */
    RUNNER("runner"),
    /** The backend's client certificate, issued by the CA. */
    BACKEND("backend"),
    /** A self-signed client certificate that is not issued by the CA. */
    ROGUE("rogue");

    private final String fileStem;

    Identity(String fileStem) {
      this.fileStem = fileStem;
    }

    /** File-name stem, for example {@code runner} for {@code runner.crt}. */
    public String fileStem() {
      return fileStem;
    }
  }

  private static final String KEYTOOL_TIMEOUT_MESSAGE = "keytool did not finish";
  private static final int VALIDITY_DAYS = 2;
  private static final String DEFAULT_SAN = "dns:localhost,ip:127.0.0.1,ip:0:0:0:0:0:0:0:1";

  private static RunnerTestTls shared;

  private final Path directory;

  private RunnerTestTls(Path directory) {
    this.directory = directory;
  }

  /**
   * One instance per JVM, generated on first use in a temporary directory that is deleted at JVM
   * exit.
   *
   * @return the shared test CA
   */
  public static synchronized RunnerTestTls shared() {
    if (shared == null) {
      try {
        Path dir = Files.createTempDirectory("obs009-runner-tls-");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> deleteQuietly(dir)));
        shared = create(dir);
      } catch (IOException failure) {
        throw new IllegalStateException("cannot create the shared runner test CA directory");
      }
    }
    return shared;
  }

  /**
   * Generates a fresh CA and the three identities into {@code directory}, which must exist and be
   * empty.
   *
   * @param directory where to write the files; the caller owns and deletes it
   * @return the test CA
   */
  public static RunnerTestTls create(Path directory) {
    try {
      try (Stream<Path> existing = Files.list(directory)) {
        if (existing.findAny().isPresent()) {
          throw new IllegalStateException("the test CA directory must be empty");
        }
      }
      RunnerTestTls tls = new RunnerTestTls(directory);
      tls.generate();
      return tls;
    } catch (IOException | GeneralSecurityException failure) {
      throw new IllegalStateException(
          "cannot generate the runner test CA: " + failure.getClass().getSimpleName());
    }
  }

  /** Directory holding every file. */
  public Path directory() {
    return directory;
  }

  /** The CA certificate (PEM), the runner's client-CA bundle. */
  public Path caCertificate() {
    return directory.resolve("ca.pem");
  }

  /** The certificate file (PEM, leaf then CA) of an identity. */
  public Path certificate(Identity identity) {
    return directory.resolve(identity.fileStem() + ".crt");
  }

  /** The private key file (PKCS#8 PEM) of an identity. */
  public Path privateKey(Identity identity) {
    return directory.resolve(identity.fileStem() + ".key");
  }

  /** The PKCS12 key store (key entry and chain) of an identity. */
  public Path keyStore(Identity identity) {
    return directory.resolve(identity.fileStem() + ".p12");
  }

  /** The file holding the password of {@link #keyStore(Identity)}. */
  public Path keyStorePasswordFile(Identity identity) {
    return directory.resolve(identity.fileStem() + ".p12.pass");
  }

  /** The PKCS12 trust store holding the CA only. */
  public Path trustStore() {
    return directory.resolve("truststore.p12");
  }

  /** The file holding the password of {@link #trustStore()}. */
  public Path trustStorePasswordFile() {
    return directory.resolve("truststore.p12.pass");
  }

  /** The PKCS12 trust store holding the rogue certificate only: "the CA is not trusted here". */
  public Path rogueTrustStore() {
    return directory.resolve("rogue-truststore.p12");
  }

  /** The file holding the password of {@link #rogueTrustStore()}. */
  public Path rogueTrustStorePasswordFile() {
    return directory.resolve("rogue-truststore.p12.pass");
  }

  /**
   * The settings the backend uses: its own key store and the CA trust store.
   *
   * @return settings for {@link StudioRunnerTls#from}
   */
  public StudioRunnerTls.Settings backendSettings() {
    return settingsFor(Identity.BACKEND, trustStore(), trustStorePasswordFile());
  }

  /**
   * Settings for any identity against any trust store, for negative cases.
   *
   * @param identity whose key store the backend side presents
   * @param trust the trust store file
   * @param trustPasswordFile its password file
   * @return settings for {@link StudioRunnerTls#from}
   */
  public StudioRunnerTls.Settings settingsFor(
      Identity identity, Path trust, Path trustPasswordFile) {
    return new StudioRunnerTls.Settings(
        keyStore(identity),
        keyStorePasswordFile(identity),
        StudioRunnerTls.DEFAULT_STORE_TYPE,
        trust,
        trustPasswordFile,
        StudioRunnerTls.DEFAULT_STORE_TYPE);
  }

  /**
   * The backend identity as the production class builds it.
   *
   * @return a TLS identity presenting the backend certificate and trusting the CA
   */
  public StudioRunnerTls backendTls() {
    return StudioRunnerTls.from(backendSettings());
  }

  /**
   * The SHA-256 fingerprint of an identity's leaf certificate in the form Node prints for {@code
   * X509Certificate.fingerprint256}: upper-case hex pairs separated by colons. Public certificate
   * data, used for the runner's controller pin.
   *
   * @param identity which leaf
   * @return {@code AB:CD:...}
   */
  public String fingerprint256(Identity identity) {
    try {
      return HexFormat.ofDelimiter(":")
          .withUpperCase()
          .formatHex(MessageDigest.getInstance("SHA-256").digest(leaf(identity).getEncoded()));
    } catch (GeneralSecurityException failure) {
      throw new IllegalStateException("cannot fingerprint " + identity);
    }
  }

  /**
   * Loads an identity's key store with its own password.
   *
   * @param identity which key store
   * @return the loaded store
   */
  public KeyStore loadKeyStore(Identity identity) {
    try (InputStream input = Files.newInputStream(keyStore(identity))) {
      KeyStore store = KeyStore.getInstance("PKCS12");
      store.load(input, password(keyStorePasswordFile(identity)));
      return store;
    } catch (IOException | GeneralSecurityException failure) {
      throw new IllegalStateException("cannot load the key store of " + identity);
    }
  }

  /**
   * The leaf certificate of an identity.
   *
   * @param identity which leaf
   * @return the X.509 certificate
   */
  public X509Certificate leaf(Identity identity) {
    try {
      KeyStore store = loadKeyStore(identity);
      return (X509Certificate) store.getCertificateChain(identity.fileStem())[0];
    } catch (GeneralSecurityException failure) {
      throw new IllegalStateException("cannot read the leaf of " + identity);
    }
  }

  @Override
  public String toString() {
    return "RunnerTestTls[test CA, identities=runner,backend,rogue]";
  }

  // ---- generation ----

  private void generate() throws IOException, GeneralSecurityException {
    Path caStore = directory.resolve("ca.p12");
    Path caPass = writePassword("ca.p12.pass");
    keytool(
        "-genkeypair",
        "-alias",
        "ca",
        "-keyalg",
        "RSA",
        "-keysize",
        "2048",
        "-dname",
        "CN=obs009-test-ca",
        "-validity",
        String.valueOf(VALIDITY_DAYS),
        "-ext",
        "bc:c=ca:true",
        "-ext",
        "ku=keyCertSign,cRLSign",
        "-keystore",
        caStore.toString(),
        "-storetype",
        "PKCS12",
        "-storepass:file",
        caPass.toString());
    restrictToOwner(caStore);
    keytool(
        "-exportcert",
        "-alias",
        "ca",
        "-rfc",
        "-file",
        caCertificate().toString(),
        "-keystore",
        caStore.toString(),
        "-storepass:file",
        caPass.toString());

    // The three identities are independent: generate them concurrently (each is a cold JVM).
    List<CompletableFuture<Void>> work = new ArrayList<>();
    for (Identity identity : Identity.values()) {
      work.add(
          CompletableFuture.runAsync(
              () -> {
                try {
                  String stem = identity.fileStem();
                  switch (identity) {
                    case RUNNER ->
                        issue(
                            stem,
                            "CN=localhost",
                            "serverAuth,clientAuth",
                            null,
                            VALIDITY_DAYS,
                            false);
                    case BACKEND ->
                        issue(
                            stem,
                            "CN=obs009-backend",
                            "serverAuth,clientAuth",
                            null,
                            VALIDITY_DAYS,
                            false);
                    case ROGUE ->
                        issue(
                            stem,
                            "CN=localhost",
                            "serverAuth,clientAuth",
                            null,
                            VALIDITY_DAYS,
                            true);
                  }
                } catch (IOException | GeneralSecurityException failure) {
                  throw new IllegalStateException(
                      "cannot issue " + identity + ": " + failure.getClass().getSimpleName());
                }
              }));
    }
    try {
      CompletableFuture.allOf(work.toArray(CompletableFuture[]::new)).join();
    } catch (RuntimeException failure) {
      Throwable cause = failure.getCause() == null ? failure : failure.getCause();
      throw new IllegalStateException(cause.getMessage());
    }

    writeTrustStore("truststore.p12", ca());
    writeTrustStore("rogue-truststore.p12", leaf(Identity.ROGUE));
  }

  /**
   * Issues an extra CA-signed client key store {@code <stem>.p12} (password in {@code
   * <stem>.p12.pass}) with a chosen extended key usage and validity window, for tests that must
   * show a bad certificate is refused. Takes about 3 s (three {@code keytool} runs).
   *
   * @param stem unique file stem; must not be {@code runner}, {@code backend} or {@code rogue}
   * @param extendedKeyUsage keytool {@code eku} list such as {@code serverAuth}, or {@code null}
   *     for no extended key usage extension
   * @param startDate keytool {@code -startdate} such as {@code -3d}, or {@code null} for now
   * @param validityDays days the certificate is valid from its start
   * @return the key store path
   */
  public Path issueVariant(
      String stem, String extendedKeyUsage, String startDate, int validityDays) {
    return issueVariant(stem, extendedKeyUsage, startDate, validityDays, DEFAULT_SAN);
  }

  /**
   * As {@link #issueVariant(String, String, String, int)} with chosen subject alternative names,
   * for the case where the certificate is valid and CA-issued but names a different host: a client
   * that verifies the host name must refuse it.
   *
   * @param stem unique file stem; must not be {@code runner}, {@code backend} or {@code rogue}
   * @param extendedKeyUsage keytool {@code eku} list, or {@code null}
   * @param startDate keytool {@code -startdate}, or {@code null} for now
   * @param validityDays days the certificate is valid from its start
   * @param subjectAlternativeNames keytool {@code san} value such as {@code dns:other.invalid}
   * @return the key store path
   */
  public Path issueVariant(
      String stem,
      String extendedKeyUsage,
      String startDate,
      int validityDays,
      String subjectAlternativeNames) {
    try {
      issue(
          stem,
          "CN=obs009-" + stem,
          extendedKeyUsage,
          startDate,
          validityDays,
          false,
          subjectAlternativeNames);
      return directory.resolve(stem + ".p12");
    } catch (IOException | GeneralSecurityException failure) {
      throw new IllegalStateException(
          "cannot issue " + stem + ": " + failure.getClass().getSimpleName());
    }
  }

  /**
   * A server-side TLS context for a test double that must look like the runner (or like a stray
   * listener): {@code identity} is the certificate it presents, and a client certificate is trusted
   * only if it chains to {@code trust}.
   *
   * @param identity the certificate and key the server presents
   * @param trust the trust store used to verify client certificates
   * @param trustPasswordFile its password file
   * @return a context for {@code HttpsConfigurator}; pair it with {@code setNeedClientAuth(true)}
   */
  public SSLContext serverContext(Identity identity, Path trust, Path trustPasswordFile) {
    return serverContext(identity.fileStem(), trust, trustPasswordFile);
  }

  /**
   * As {@link #serverContext(Identity, Path, Path)} for a certificate minted by {@link
   * #issueVariant}, so a test double can present a certificate with chosen SANs.
   *
   * @param stem the variant's file stem
   * @param trust the trust store used to verify client certificates
   * @param trustPasswordFile its password file
   * @return a context for {@code HttpsConfigurator}
   */
  public SSLContext serverContext(String stem, Path trust, Path trustPasswordFile) {
    Path keyStoreFile = directory.resolve(stem + ".p12");
    char[] keyPassword = password(directory.resolve(stem + ".p12.pass"));
    char[] trustPassword = password(trustPasswordFile);
    try (InputStream input = Files.newInputStream(trust)) {
      KeyManagerFactory keys =
          KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
      keys.init(loadPkcs12(keyStoreFile, keyPassword), keyPassword);
      KeyStore trusted = KeyStore.getInstance("PKCS12");
      trusted.load(input, trustPassword);
      TrustManagerFactory trustFactory =
          TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
      trustFactory.init(trusted);
      SSLContext context = SSLContext.getInstance("TLS");
      context.init(keys.getKeyManagers(), trustFactory.getTrustManagers(), new SecureRandom());
      return context;
    } catch (IOException | GeneralSecurityException failure) {
      throw new IllegalStateException(
          "cannot build the server context of " + stem + ": " + failure.getClass().getSimpleName());
    } finally {
      Arrays.fill(keyPassword, '\0');
      Arrays.fill(trustPassword, '\0');
    }
  }

  /**
   * The password of an identity's key store, for tests that assemble their own stores. Test
   * material only; never log it.
   *
   * @param identity whose key store
   * @return a fresh copy the caller may zero
   */
  public char[] keyStorePassword(Identity identity) {
    return password(keyStorePasswordFile(identity));
  }

  private X509Certificate ca() {
    try {
      return readCertificates(caCertificate()).get(0);
    } catch (IOException | GeneralSecurityException failure) {
      throw new IllegalStateException("cannot read the test CA certificate");
    }
  }

  /**
   * Issues one leaf: keytool makes the key and the signature; Java assembles the files. A
   * self-signed leaf is not issued by the CA.
   */
  private void issue(
      String stem,
      String dname,
      String extendedKeyUsage,
      String startDate,
      int validityDays,
      boolean selfSigned)
      throws IOException, GeneralSecurityException {
    issue(stem, dname, extendedKeyUsage, startDate, validityDays, selfSigned, DEFAULT_SAN);
  }

  private void issue(
      String stem,
      String dname,
      String extendedKeyUsage,
      String startDate,
      int validityDays,
      boolean selfSigned,
      String subjectAlternativeNames)
      throws IOException, GeneralSecurityException {
    Path caStore = directory.resolve("ca.p12");
    Path caPass = directory.resolve("ca.p12.pass");
    X509Certificate ca = ca();
    Path passFile = writePassword(stem + ".p12.pass");
    char[] password = password(passFile);
    Path work = directory.resolve(stem + ".work.p12");
    String san = "san=" + subjectAlternativeNames;
    String usage = extendedKeyUsage == null ? null : "eku=" + extendedKeyUsage;
    List<String> generate =
        new ArrayList<>(
            List.of(
                "-genkeypair",
                "-alias",
                stem,
                "-keyalg",
                "RSA",
                "-keysize",
                "2048",
                "-dname",
                dname,
                "-validity",
                String.valueOf(validityDays),
                "-keystore",
                work.toString(),
                "-storetype",
                "PKCS12",
                "-storepass:file",
                passFile.toString()));
    if (selfSigned) {
      generate.addAll(List.of("-ext", san));
      if (usage != null) {
        generate.addAll(List.of("-ext", usage));
      }
    }
    keytool(generate.toArray(String[]::new));

    List<X509Certificate> chain;
    if (selfSigned) {
      chain = List.of((X509Certificate) loadPkcs12(work, password).getCertificate(stem));
    } else {
      Path csr = directory.resolve(stem + ".csr");
      Path signed = directory.resolve(stem + ".signed.pem");
      keytool(
          "-certreq",
          "-alias",
          stem,
          "-file",
          csr.toString(),
          "-keystore",
          work.toString(),
          "-storepass:file",
          passFile.toString());
      List<String> sign =
          new ArrayList<>(
              List.of(
                  "-gencert",
                  "-alias",
                  "ca",
                  "-infile",
                  csr.toString(),
                  "-outfile",
                  signed.toString(),
                  "-rfc",
                  "-validity",
                  String.valueOf(validityDays),
                  "-ext",
                  san,
                  "-ext",
                  "ku=digitalSignature,keyEncipherment",
                  "-keystore",
                  caStore.toString(),
                  "-storepass:file",
                  caPass.toString()));
      if (usage != null) {
        sign.addAll(List.of("-ext", usage));
      }
      if (startDate != null) {
        sign.addAll(List.of("-startdate", startDate));
      }
      keytool(sign.toArray(String[]::new));
      chain = List.of(readCertificates(signed).get(0), ca);
      Files.deleteIfExists(csr);
      Files.deleteIfExists(signed);
    }

    Key key = loadPkcs12(work, password).getKey(stem, password);
    KeyStore finalStore = KeyStore.getInstance("PKCS12");
    finalStore.load(null, null);
    finalStore.setKeyEntry(stem, key, password, chain.toArray(new Certificate[0]));
    Path out = directory.resolve(stem + ".p12");
    try (var stream = Files.newOutputStream(privateFile(out))) {
      finalStore.store(stream, password);
    }
    StringBuilder pem = new StringBuilder();
    for (X509Certificate certificate : chain) {
      pem.append(pem("CERTIFICATE", certificate.getEncoded()));
    }
    Files.writeString(directory.resolve(stem + ".crt"), pem.toString(), StandardCharsets.US_ASCII);
    Files.write(
        privateFile(directory.resolve(stem + ".key")),
        pem("PRIVATE KEY", key.getEncoded()).getBytes(StandardCharsets.US_ASCII));
    Arrays.fill(password, '\0');
    Files.deleteIfExists(work);
  }

  private void writeTrustStore(String name, X509Certificate anchor)
      throws IOException, GeneralSecurityException {
    Path passFile = writePassword(name + ".pass");
    char[] password = password(passFile);
    KeyStore store = KeyStore.getInstance("PKCS12");
    store.load(null, null);
    store.setCertificateEntry("anchor", anchor);
    try (var stream = Files.newOutputStream(privateFile(directory.resolve(name)))) {
      store.store(stream, password);
    }
    Arrays.fill(password, '\0');
  }

  private static KeyStore loadPkcs12(Path file, char[] password)
      throws IOException, GeneralSecurityException {
    try (InputStream input = Files.newInputStream(file)) {
      KeyStore store = KeyStore.getInstance("PKCS12");
      store.load(input, password);
      return store;
    }
  }

  private static List<X509Certificate> readCertificates(Path pem)
      throws IOException, GeneralSecurityException {
    try (InputStream input = Files.newInputStream(pem)) {
      List<X509Certificate> certificates = new ArrayList<>();
      for (Certificate certificate :
          CertificateFactory.getInstance("X.509").generateCertificates(input)) {
        certificates.add((X509Certificate) certificate);
      }
      return certificates;
    }
  }

  private static String pem(String label, byte[] der) {
    return "-----BEGIN "
        + label
        + "-----\n"
        + Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(der)
        + "\n-----END "
        + label
        + "-----\n";
  }

  private Path writePassword(String name) throws IOException {
    byte[] random = new byte[24];
    new SecureRandom().nextBytes(random);
    Path file = directory.resolve(name);
    Files.write(
        privateFile(file),
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString(random)
            .getBytes(StandardCharsets.US_ASCII));
    return file;
  }

  private static char[] password(Path file) {
    try {
      return Files.readString(file, StandardCharsets.US_ASCII).strip().toCharArray();
    } catch (IOException failure) {
      throw new IllegalStateException("cannot read a test CA password file");
    }
  }

  private static void restrictToOwner(Path file) throws IOException {
    try {
      Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-------"));
    } catch (UnsupportedOperationException notPosix) {
      // Not a POSIX file system: nothing to restrict.
    }
  }

  /** Creates (or truncates) a file that only the owner can read where POSIX permissions exist. */
  private static Path privateFile(Path file) throws IOException {
    Files.deleteIfExists(file);
    try {
      return Files.createFile(
          file, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
    } catch (UnsupportedOperationException notPosix) {
      return Files.createFile(file);
    }
  }

  private static void keytool(String... arguments) throws IOException {
    List<String> command = new ArrayList<>();
    command.add(Path.of(System.getProperty("java.home"), "bin", "keytool").toString());
    command.addAll(List.of(arguments));
    Process process = new ProcessBuilder(command).redirectErrorStream(true).start();
    try {
      // The passwords are passed as files, so keytool's output holds no secret.
      byte[] output = process.getInputStream().readAllBytes();
      if (!process.waitFor(60, TimeUnit.SECONDS)) {
        process.destroyForcibly();
        throw new IOException(KEYTOOL_TIMEOUT_MESSAGE);
      }
      if (process.exitValue() != 0) {
        String text = new String(output, StandardCharsets.UTF_8).strip();
        throw new IOException(
            "keytool "
                + arguments[0]
                + " failed: "
                + text.substring(Math.max(0, text.length() - 400)));
      }
    } catch (InterruptedException interrupted) {
      process.destroyForcibly();
      Thread.currentThread().interrupt();
      throw new IOException(KEYTOOL_TIMEOUT_MESSAGE);
    }
  }

  private static void deleteQuietly(Path dir) {
    try (Stream<Path> walk = Files.walk(dir)) {
      walk.sorted(Comparator.reverseOrder()).forEach(path -> path.toFile().delete());
    } catch (IOException ignored) {
      // best effort at JVM exit
    }
  }
}
