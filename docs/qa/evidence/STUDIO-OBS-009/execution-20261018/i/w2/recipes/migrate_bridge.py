import re,sys

def sub1(s, old, new, count=1):
    assert s.count(old)==count,(old[:80],s.count(old))
    return s.replace(old,new)

def migrate(path, prefix, evidence_file, planned):
    s=open(path).read()
    # ---- static declarations
    s=sub1(s,'''  static final Path WORKER_SNAPSHOT;
  static final SSLContext TLS;
  static final KeyPair ISSUER;
  static final int RUNNER_PORT;
  static final String FINGERPRINT;
''','''  static final Path DIST;
  static final RunnerTestTls RUNNER_TLS;

  /** The backend's identity toward the runner: also the guided runner client's context. */
  static final SSLContext TLS;

  /** What the runner (a worker calling the backend, or a double standing in for it) presents. */
  static final SSLContext RUNNER_SIDE;

  static final KeyPair ISSUER;
  static final int RUNNER_PORT;
''')
    # ---- static init: from 'WORKER_SNAPSHOT = TEMP.resolve("dist");' through RUNNER_PORT
    start=s.index('      WORKER_SNAPSHOT = TEMP.resolve("dist");')
    end_marker='''      try (var socket = new java.net.ServerSocket(0)) {
        RUNNER_PORT = socket.getLocalPort();
      }
'''
    end=s.index(end_marker)+len(end_marker)
    new_init='''      // STUDIO-OBS-009 AC-12 i: no private copy of dist. The harness spawns the real folded entry
      // point and records the digest of what it spawned; the sole rebuild is the F-merge's.
      DIST = RunnerProcessHarness.defaultDistDirectory().toAbsolutePath().normalize();
      ObjectNode workerEvidence = CONTRACTS.object().put("snapshot", DIST.toString());
      workerEvidence.put("distDigest", RunnerProcessHarness.distDigestOf(DIST));
      ObjectNode hashes = workerEvidence.putObject("sha256");
      for (String relative :
          List.of(
              "main.js",
              "run/browser.js",
              "guided/runtime.js",
              "guided/transport.js",
              "guided/schemas.json")) {
        hashes.put(
            relative,
            HexFormat.of()
                .formatHex(
                    MessageDigest.getInstance("SHA-256")
                        .digest(Files.readAllBytes(DIST.resolve(relative)))));
      }
      hashes.put(
          "scripts/browser-provenance.mjs",
          HexFormat.of()
              .formatHex(
                  MessageDigest.getInstance("SHA-256")
                      .digest(
                          Files.readAllBytes(
                              Path.of("../studio-runner/scripts/browser-provenance.mjs")))));
      Files.writeString(
          Path.of("%s"), workerEvidence.toString());
      // One test CA (lane D3.0): the runner and the backend certificates chain to it, the runner pins
      // the backend certificate, and the backend trusts only the CA.
      RUNNER_TLS = RunnerTestTls.shared();
      TLS = RUNNER_TLS.backendTls().sslContext();
      RUNNER_SIDE =
          RUNNER_TLS.serverContext(
              Identity.RUNNER, RUNNER_TLS.trustStore(), RUNNER_TLS.trustStorePasswordFile());
      var generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      ISSUER = generator.generateKeyPair();
      Files.writeString(
          TEMP.resolve("issuer.pub"),
          "-----BEGIN PUBLIC KEY-----\\n"
              + Base64.getMimeEncoder(64, new byte[] {10})
                  .encodeToString(ISSUER.getPublic().getEncoded())
              + "\\n-----END PUBLIC KEY-----\\n");
      // AC-12 h: an exclusive bind on both loopback families, outside the database range.
      RUNNER_PORT = RunnerProcessHarness.exclusivelyFreePort();
''' % evidence_file
    s=s[:start]+new_init+s[end:]
    # ---- Spring properties
    s=sub1(s,'''    registry.add("server.ssl.enabled", () -> true);
    registry.add("server.ssl.key-store", () -> TEMP.resolve("tls.p12").toString());
    registry.add("server.ssl.key-store-password", () -> "fixture");
    registry.add("server.ssl.key-store-type", () -> "PKCS12");
    registry.add("server.ssl.trust-store", () -> TEMP.resolve("trust.p12").toString());
    registry.add("server.ssl.trust-store-password", () -> "fixture");
    registry.add("server.ssl.client-auth", () -> "need");
''','''    RunnerProcessHarness.backendServerSslProperties(RUNNER_TLS)
        .forEach((name, value) -> registry.add(name, () -> value));
''')
    # ---- runner client bean origin
    s=sub1(s,'URI.create("https://localhost:" + RUNNER_PORT),','URI.create("https://127.0.0.1:" + RUNNER_PORT),')
    # ---- worker fields
    s=sub1(s,'''  Process worker;
  Path workerLog;
''','''  RunnerProcessHarness workerHarness;
''')
    # ---- startWorker body
    a=s.index('''    Files.writeString(
        TEMP.resolve("worker.jwt"), token("owning-worker", "worker-1", "studio-guided-controller"));
    ObjectNode config =''')
    b_marker='''          } catch (Exception ignored) {
            return false;
          }
        },
        10000);
  }
'''
    b=s.index(b_marker,a)+len(b_marker)
    mounted_record = ''
    if planned:
        mounted_record='''    // STUDIO-OBS-014 S3 (RK-2, ar-mounted-rules): the worker is given neither `rules` nor
    // `applicationPolicy`; the class's governed policy (governedPolicy()) is frozen into each
    // session and reaches the worker in the hash-bound context. This record is what the runner was
    // configured with (no secret); the runner refuses any key it does not enumerate.
    ObjectNode config =
        CONTRACTS
            .object()
            .put("workerId", "worker-1")
            .put("host", "127.0.0.1")
            .put("port", RUNNER_PORT)
            .put("journalDirectory", journal.toString())
            .put("controllerIssuer", "fixture-issuer")
            .put("controllerSubject", "controller-1")
            .put("callbackBaseUrl", "https://localhost:" + backendPort);
    Files.writeString(TEMP.resolve("worker.json"), config.toString());
'''
    new_start='''    Files.writeString(
        TEMP.resolve("worker.jwt"), token("owning-worker", "worker-1", "studio-guided-controller"));
    Path journal = Files.createTempDirectory(TEMP, "journal-");
''' + mounted_record + '''    // STUDIO-OBS-009 AC-3 / AC-12 h: the one folded entry point over TLS, spawned and reaped by the
    // harness. STUDIO-OBS-013/014 S3: a per-class object store, never a shared default directory.
    workerHarness =
        RunnerProcessHarness.builder(RUNNER_TLS)
            .port(RUNNER_PORT)
            .workDirectory(Files.createTempDirectory(TEMP, "runner-"))
            .callbackBaseUrl("https://localhost:" + backendPort)
            .env(RunnerProcessHarness.KEY_OBJECT_STORE_DIR, TEMP.resolve("objects").toString())
            .guided(
                new RunnerProcessHarness.Guided(
                    "worker-1",
                    journal,
                    "fixture-issuer",
                    "controller-1",
                    TEMP.resolve("issuer.pub"),
                    "https://localhost:" + backendPort,
                    TEMP.resolve("worker.jwt")))
            .start();
    workerHarness.awaitReady(Duration.ofSeconds(60));
  }
'''
    s=s[:a]+new_start+s[b:]
    # ---- closeWorker
    a=s.index('''    if (worker != null) {
      worker.destroy();''')
    b_marker='''    assertThat(Files.readString(workerLog))
        .doesNotContain(CAPTURE, PASSWORD_ECHO, ORDINARY_ECHO.strip());
'''
    b=s.index(b_marker,a)+len(b_marker)
    s=s[:a]+'''    var harness = workerHarness;
    workerHarness = null;
    if (harness != null) {
      // AC-11 k / I-T1: stop the runner and everything it left. The privacy oracle reads the log
      // first; then a clean exit is asserted (exit 0, no force within the guided grace) and no
      // survivor.
      var report = harness.teardown();
      assertThat(Files.readString(harness.logFile()))
          .doesNotContain(CAPTURE, PASSWORD_ECHO, ORDINARY_ECHO.strip());
      report.assertNoSurvivors();
      report.assertCleanExit();
    }
'''+s[b:]
    # ---- TLS usages as test clients of the backend / doubles of the runner
    s=s.replace('.sslContext(TLS)','.sslContext(RUNNER_SIDE)')
    s=s.replace('new com.sun.net.httpserver.HttpsConfigurator(TLS)','new com.sun.net.httpserver.HttpsConfigurator(RUNNER_SIDE)')
    s=s.replace('var ssl = TLS.getDefaultSSLParameters();','var ssl = RUNNER_SIDE.getDefaultSSLParameters();')
    # ---- the openssl command helper
    c=s.index('  static void command(String... arguments) throws Exception {')
    d=s.index('  static void await(',c)
    s=s[:c]+s[d:]
    # ---- imports
    s=sub1(s,'import com.sun.net.httpserver.HttpServer;\n','import com.citi.put.checks.studio.support.RunnerProcessHarness;\nimport com.citi.put.checks.studio.support.RunnerTestTls;\nimport com.citi.put.checks.studio.support.RunnerTestTls.Identity;\nimport com.sun.net.httpserver.HttpServer;\n')
    open(path,'w').write(s)

if __name__=='__main__':
    migrate(sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4]=='planned')
