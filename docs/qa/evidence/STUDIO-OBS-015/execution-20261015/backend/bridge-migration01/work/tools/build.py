"""Assemble GuidedBridgePlannedIT.java from the base bridge class (verbatim regions) and the
hand-written pieces in work/src. usage: python3 -I build.py <work-dir>"""

import sys

work = sys.argv[1]
base = open(f"{work}/base/GuidedBridgeIntegrationTest.java", encoding="utf-8").read().split("\n")


def lines(first, last):
    """1-based inclusive base line range."""
    return base[first - 1 : last]


def piece(name):
    return open(f"{work}/src/{name}", encoding="utf-8").read().rstrip("\n").split("\n")


assert base[85] == "class GuidedBridgeIntegrationTest {"
assert base[123].startswith("  static final AtomicInteger FILL_RECEIPTS")
assert base[125] == "  static {"
assert base[372] == "      APPLICATION.start();"
assert base[384] == "  }" and base[385] == ""
assert base[386] == "  @DynamicPropertySource" and base[400] == "  }"
assert base[411] == "    @Bean" and base[412].endswith("FilterRegistrationBean<jakarta.servlet.Filter>")
assert base[468] == "    @Bean" and base[469] == "    DataSource dataSource() {" and base[472] == "    }"
assert base[537] == "    @Bean" and base[538] == "    GuidedRunnerClient runner() {" and base[554] == "    }"
assert base[557] == "  /**" and base[586] == "  }"
assert base[748] == "  @BeforeEach" and base[870] == "  }"
assert base[792].startswith("    jdbc.execute(") and base[808] == "        CONFIG_INPUT);"
assert base[811].startswith("    com.citi.put.checks.studio.support.ObservedPublicationFixture.seedPolicy(")
assert base[812].strip().startswith("jdbc, \"CSI-123\"")

out = []
out += piece("head.java.txt")
out += lines(87, 125)
out += piece("statics-add.java.txt")
out.append("")
static_block = []
for n, line in enumerate(lines(126, 385), start=126):
    if n == 373:
        static_block += piece("provider-start.java.txt")
    line = line.replace('"guided-bridge-"', '"guided-bridge-planned-"')
    line = line.replace(
        "/tmp/studio-obs004-tested-worker.json", "/tmp/studio-obs015-bridge-planned-worker.json"
    )
    static_block.append(line)
out += static_block
out += lines(386, 402)
application = []
for line in piece("application.java.txt"):
    if line == "%%FAULT_FILTER_AND_DATASOURCE%%":
        application += lines(412, 473)
    elif line == "%%RUNNER_AND_DISPATCH%%":
        application += lines(538, 555)
    else:
        application.append(line)
out += application
out.append("")
out += lines(558, 587)
out += piece("provider.java.txt")  # begins with its own blank separator line
out.append("")
before = []
for n, line in enumerate(lines(749, 871), start=749):
    if 793 <= n <= 809:
        continue
    before.append(line)
    if n == 813:
        before += piece("beforeeach-add.java.txt")
out += before
out += [
    "",
    "  @AfterEach",
    "  void closeWorker() throws Exception {",
    "    releaseClaimResponse.countDown();",
    "    releaseRefreshCallback.countDown();",
    "    if (worker != null) {",
    "      worker.destroy();",
    "      if (!worker.waitFor(5, TimeUnit.SECONDS)) {",
    "        worker.destroyForcibly();",
    "        assertThat(worker.waitFor(5, TimeUnit.SECONDS)).isTrue();",
    "      }",
    "    }",
    "    assertThat(Files.readString(workerLog))",
    "        .doesNotContain(CAPTURE, PASSWORD_ECHO, ORDINARY_ECHO.strip());",
    "    // aria-bridge-ruling01 §4.5: the controlled model only ever plans and selects.",
    '    assertThat(PROVIDER_KINDS).isSubsetOf("SOURCE_PLAN", "NEXT_ACTION");',
    "  }",
    "",
    "  @AfterAll",
    "  static void close() {",
    "    APPLICATION.stop(0);",
    "    PROVIDER.stop(0);",
    "    DATABASE.stop();",
    "  }",
    "",
]
out += piece("tests.java.txt")
out.append("")
out += piece("helpers.java.txt")
out.append("")
out += piece("tail.java.txt")
text = "\n".join(out) + "\n"
text = text.replace(
    "class GuidedBridgeIntegrationTest", "class GuidedBridgePlannedIT"
)
open(f"{work}/out/GuidedBridgePlannedIT.java", "w", encoding="utf-8").write(text)
print("lines", text.count("\n"))
