import sys
sys.path.insert(0,'/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/dex-w2-i')
from migrate_bridge import sub1

def migrate(path):
    s=open(path).read()
    s=sub1(s,'''    static final Path WORKER_SNAPSHOT;
    static final SSLContext TLS;
    static final KeyPair ISSUER;
    static final int RUNNER_PORT;
    static final String FINGERPRINT;
''','''    static final Path DIST;
    static final RunnerTestTls RUNNER_TLS;

    /** The backend's identity toward the runner: also the guided runner client's context. */
    static final SSLContext TLS;

    /** What the runner (a double standing in for it, or a client of the backend) presents. */
    static final SSLContext RUNNER_SIDE;

    static final KeyPair ISSUER;
    static final int RUNNER_PORT;
''')
    start=s.index('        WORKER_SNAPSHOT = TEMP.resolve("dist");')
    end_marker='''        try (var socket = new java.net.ServerSocket(0)) {
          RUNNER_PORT = socket.getLocalPort();
        }
'''
    end=s.index(end_marker)+len(end_marker)
    new_init='''        // STUDIO-OBS-009 AC-12 i: no private copy of dist. The harness spawns the real folded entry
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
            Path.of("/tmp/studio-obs005-tested-worker.json"), workerEvidence.toString());
        // One test CA (lane D3.0): the runner and the backend certificates chain to it, the runner
        // pins the backend certificate, and the backend trusts only the CA.
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
'''
    s=s[:start]+new_init+s[end:]
    s=sub1(s,'''      registry.add("server.ssl.enabled", () -> true);
      registry.add("server.ssl.key-store", () -> TEMP.resolve("tls.p12").toString());
      registry.add("server.ssl.key-store-password", () -> "fixture");
      registry.add("server.ssl.key-store-type", () -> "PKCS12");
      registry.add("server.ssl.trust-store", () -> TEMP.resolve("trust.p12").toString());
      registry.add("server.ssl.trust-store-password", () -> "fixture");
      registry.add("server.ssl.client-auth", () -> "need");
''','''      RunnerProcessHarness.backendServerSslProperties(RUNNER_TLS)
          .forEach((name, value) -> registry.add(name, () -> value));
''')
    # bean + realClient origin
    s=s.replace('URI.create("https://localhost:" + Environment.RUNNER_PORT)','URI.create("https://127.0.0.1:" + Environment.RUNNER_PORT)')
    s=sub1(s,'metrics.put("workerSnapshot", Environment.WORKER_SNAPSHOT.toString());','metrics.put("workerSnapshot", Environment.DIST.toString());')
    s=sub1(s,'new com.sun.net.httpserver.HttpsConfigurator(Environment.TLS)','new com.sun.net.httpserver.HttpsConfigurator(Environment.RUNNER_SIDE)')
    s=s.replace('.sslContext(Environment.TLS)','.sslContext(Environment.RUNNER_SIDE)')
    # scanOnce: the deployed coordinator takes the backend identity, no JVM default
    s=sub1(s,'''    javax.net.ssl.SSLContext previous = javax.net.ssl.SSLContext.getDefault();
    Path token = Files.createTempFile("obs005-r1-controller", ".jwt");''','''    Path token = Files.createTempFile("obs005-r1-controller", ".jwt");''')
    s=sub1(s,'''      javax.net.ssl.SSLContext.setDefault(Environment.TLS);
      new com.citi.put.checks.studio.guided.translation.GuidedTranslationCoordinator(
              store, repository, C, URI.create("https://localhost:" + port), token)
          .continueRuns();
    } finally {
      javax.net.ssl.SSLContext.setDefault(previous);
      Files.deleteIfExists(token);''','''      new com.citi.put.checks.studio.guided.translation.GuidedTranslationCoordinator(
              store,
              repository,
              C,
              URI.create("https://localhost:" + port),
              token,
              Environment.RUNNER_TLS.backendTls())
          .continueRuns();
    } finally {
      Files.deleteIfExists(token);''')
    # fixture fields
    s=sub1(s,'''    Process worker;
    Path workerLog;
''','''    Process worker;
    RunnerProcessHarness workerHarness;
''')
    # config block -> journal
    a=s.index('''      ObjectNode config =
          CONTRACTS
              .object()
              .put("workerId", "worker-1")''')
    b_marker='''              .put("callbackTokenFile", TEMP.resolve("worker.jwt").toString());
'''
    b=s.index(b_marker,a)+len(b_marker)
    s=s[:a]+'''      Path journal = Files.createTempDirectory(TEMP, "journal-");
'''+s[b:]
    # tail of startWorker
    a=s.index('''      Path mounted = TEMP.resolve("worker.json");
      Files.writeString(mounted, config.toString());''')
    b_marker='''          },
          10000);
    }

    void closeWorker() throws Exception {'''
    b=s.index(b_marker,a)
    old_tail=s[a:b]
    # extract the wrapper script prelude (lines building `script`)
    new_tail='''      // STUDIO-OBS-009 AC-3 / AC-12 h: the one folded entry point over TLS, spawned and reaped by
      // the harness. STUDIO-OBS-013/014 S3: a per-class object store, never a shared default
      // directory.
      var spawn =
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
                      TEMP.resolve("worker.jwt")));
      if (testName.equals(
          "aForgedFrozenPolicyHashFromTheRealBackendIsRejectedByTheRealWorkerBeforeBrowserLaunch")) {
        livePolicyCounter = TEMP.resolve("live-policy-counter-" + UUID.randomUUID() + ".json");
        String playwright =
            Path.of("../studio-runner/node_modules/playwright/index.mjs")
                .toAbsolutePath()
                .normalize()
                .toUri()
                .toString();
        String counter = new ObjectMapper().writeValueAsString(livePolicyCounter.toString());
        // Measurement only: exact production module, original Playwright call-through, and actual
        // HTTPS request events. No body, token, config, result or browser replacement is observed.
        // The harness appends the standard main() call after this prelude.
        String prelude =
            "import {chromium} from '"
                + playwright
                + "';"
                + "import fs from 'node:fs';import https from 'node:https';"
                + "import {syncBuiltinESMExports} from 'node:module';const file="
                + counter
                + ";"
                + "const original=chromium.launchPersistentContext;"
                + "const state={registered:typeof original==='function',launches:0,rpcs:{}};"
                + "const save=()=>fs.writeFileSync(file,JSON.stringify(state),{mode:0o600});save();"
                + "chromium.launchPersistentContext=function(...args){state.launches++;save();"
                + "return Reflect.apply(original,this,args);};"
                + "const serverFactory=https.createServer;https.createServer=function(...args){"
                + "const server=Reflect.apply(serverFactory,this,args);server.prependListener('request',req=>{"
                + "const route=(req.url||'').split('/').at(-1);state.rpcs[route]=(state.rpcs[route]||0)+1;save();});"
                + "return server;};syncBuiltinESMExports();";
        spawn.preload(prelude);
      }
      workerHarness = spawn.start();
      worker = workerHarness.process();
      if (livePolicyCounter != null && spawn != null && testName.equals(
          "aForgedFrozenPolicyHashFromTheRealBackendIsRejectedByTheRealWorkerBeforeBrowserLaunch")) {
        livePolicyWrapper = workerHarness.workDirectory().resolve("entry.mjs");
      }
      workerHarness.awaitReady(Duration.ofSeconds(60));
    }

    void closeWorker() throws Exception {'''
    s=s[:a]+new_tail+s[b+len(b_marker):]
    # closeWorker body
    a=s.index('''      Throwable failure = null;
      try {
        if (worker != null) {
          worker.destroy();''')
    b_marker='''      try {
        if (workerLog != null) {
          assertThat(Files.readString(workerLog))
              .doesNotContain(CAPTURE, PASSWORD_ECHO, ORDINARY_ECHO.strip());
        }
      } catch (Throwable privacy) {'''
    b=s.index(b_marker,a)+len(b_marker)
    s=s[:a]+'''      Throwable failure = null;
      var harness = workerHarness;
      workerHarness = null;
      RunnerProcessHarness.TeardownReport report = null;
      try {
        if (harness != null) {
          // AC-11 k / I-T1: stop the runner and everything it left.
          report = harness.teardown();
        }
      } catch (Throwable cleanup) {
        failure = cleanup;
      }
      try {
        if (harness != null) {
          assertThat(Files.readString(harness.logFile()))
              .doesNotContain(CAPTURE, PASSWORD_ECHO, ORDINARY_ECHO.strip());
          // Exit 0 inside the guided grace and no survivor (ruling W1.5 part 1, I-T1).
          report.assertNoSurvivors();
          report.assertCleanExit();
        }
      } catch (Throwable privacy) {'''+s[b:]
    # imports
    s=sub1(s,'import com.fasterxml.jackson.databind.JsonNode;\n','import com.citi.put.checks.studio.support.RunnerProcessHarness;\nimport com.citi.put.checks.studio.support.RunnerTestTls;\nimport com.citi.put.checks.studio.support.RunnerTestTls.Identity;\nimport com.fasterxml.jackson.databind.JsonNode;\n')
    # command helper (static, inside Environment)
    c=s.index('    static void command(String... arguments) throws Exception {')
    d=s.index('    static void await(',c)
    s=s[:c]+s[d:]
    open(path,'w').write(s)

if __name__=='__main__':
    migrate(sys.argv[1])
