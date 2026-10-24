"""Off-tree deterministic draft builder. No compiler, tests, or source writes."""
from pathlib import Path
import difflib
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[7]
OUT = Path(__file__).resolve().parent
BASE = Path('backend/src/test/java/com/citi/put/checks/studio/guided/bridge')
NAMES = ['GuidedBridgeIntegrationTest', 'GuidedBridgePlannedIT']
SOURCES = {name: (ROOT / BASE / (name + '.java')).read_text() for name in NAMES}


def masked(s):
    # Preserve offsets while hiding strings/chars/comments, including Java text blocks.
    pattern = r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/'
    return re.sub(pattern, lambda m: ''.join('\n' if c == '\n' else ' ' for c in m[0]), s)


def method(s, name):
    m = re.search(r'^ {2,4}(?:(?:public|private|protected|static|final|synchronized) )*(?:<T> )?[\w.<>,?\[\]]+\s+' + name + r'\([^;{}]*?\)\s*(?:throws [^{]+)?\{', s, re.M)
    assert m, name
    start = m.start()
    if s[:start].endswith('  @SafeVarargs\n'):
        start -= len('  @SafeVarargs\n')
    mask = masked(s)
    opening = mask.index('{', m.start())
    level = 1
    end = opening + 1
    while level:
        level += (mask[end] == '{') - (mask[end] == '}')
        end += 1
    return start, end, s[start:end]


def replace_method(s, name, replacement):
    start, end, _ = method(s, name)
    return s[:start] + replacement + s[end:]


def namespaced(s, fields):
    mask = masked(s)
    matches = list(re.finditer(r'\b(?:' + '|'.join(fields) + r')\b', mask))
    for m in reversed(matches):
        s = s[:m.start()] + 'ENV.' + s[m.start():]
    return s


original = SOURCES[NAMES[0]]
fields_start = original.index('  static final GuidedContracts CONTRACTS')
fields_end = original.index('  static {', fields_start)
field_text = original[fields_start:fields_end].replace('  static ', '  ')
FIELDS = ['CONTRACTS', 'DATABASE', 'TEMP', 'DIST', 'RUNNER_TLS', 'TLS', 'RUNNER_SIDE', 'ISSUER',
          'RUNNER_PORT', 'APPLICATION', 'NAVIGATIONS', 'CONNECTIONS', 'RECEIPT', 'CAPTURE',
          'PASSWORD_ECHO', 'ORDINARY_ECHO', 'ECHO_NAVIGATIONS', 'TOGGLE_ATTEMPTS', 'privacyEcho',
          'nativeToggle', 'CONFIG_INPUT', 'ORIGIN', 'replaceTarget', 'wideSession', 'genericRead',
          'belowFold', 'multiStep', 'dropCompletionCallbacks', 'failClaims', 'corruptClaimResponse',
          'HOLD_NEXT_REFRESH', 'refreshCallbackHeld', 'releaseRefreshCallback', 'slowNavigationMillis',
          'HOLD_NEXT_CLAIM', 'claimResponseCaptured', 'releaseClaimResponse', 'MUTATIONS',
          'CLICK_RECEIPTS', 'FILL_RECEIPTS']
FIELD_RENAMES = {name: name.lower().split('_')[0] + ''.join(part.title() for part in name.lower().split('_')[1:])
                 if name.isupper() else name for name in FIELDS}
init_start = original.index('      TEMP = Files.createTempDirectory')
init_end = original.index('      APPLICATION.start();', init_start)
constructor = original[init_start:init_end]
planned_init = SOURCES[NAMES[1]][SOURCES[NAMES[1]].index('      TEMP = Files.createTempDirectory'):SOURCES[NAMES[1]].index('      PROVIDER = HttpServer.create(')]
assert planned_init.replace('"guided-bridge-planned-"', '"guided-bridge-"').replace(
    '"/tmp/studio-obs015-bridge-planned-worker.json"', '"/tmp/studio-obs004-tested-worker.json"') == constructor
constructor = constructor.replace('Files.createTempDirectory("guided-bridge-")', 'Files.createTempDirectory(temporaryPrefix)')
constructor = constructor.replace('Path.of("/tmp/studio-obs004-tested-worker.json")', 'workerEvidencePath')
start_end = original.index('    } catch (Exception failure)', init_end)
start_body = original[init_end:start_end]
shared_methods = []

# Their bodies are exact common fixture implementations, independent of planner authority.
for name in ['properties', 'governedPolicy', 'token']:
    left = method(original, name)[2]
    right = method(SOURCES[NAMES[1]], name)[2]
    assert left == right, name
    shared_methods.append(left.replace('  static ', '  ', 1))
completion = method(original, 'completionFault')[2]
assert completion == method(SOURCES[NAMES[1]], 'completionFault')[2]
completion = '\n'.join(line[2:] if line.startswith('  ') else line for line in completion.splitlines())
shared_methods.append(completion)

before = method(original, 'startWorker')[2]
scenario_start = before.index('    String testName')
scenario_end = before.index('    String isolatedDatabase')
scenario_body = before[scenario_start:scenario_end]
assert scenario_body == method(SOURCES[NAMES[1]], 'startWorker')[2][scenario_start:scenario_end]
database_start = scenario_end
database_end = before.index('    jdbc.execute(', database_start)
database_body = before[database_start:database_end]
assert database_body in method(SOURCES[NAMES[1]], 'startWorker')[2]
reset_start = before.index('    HOLD_NEXT_REFRESH.set(false);')
reset_end = before.index('    Files.writeString(', reset_start)
reset_body = before[reset_start:reset_end]
assert reset_body in method(SOURCES[NAMES[1]], 'startWorker')[2]
journal_start = reset_end
journal_end = before.index('    // STUDIO-OBS-009 AC-3', journal_start)
journal_body = before[journal_start:journal_end]
worker_start = before.index('    workerHarness =', journal_end)
worker_end = before.index('\n  }', worker_start)
worker_body = before[worker_start:worker_end]
assert worker_body in method(SOURCES[NAMES[1]], 'startWorker')[2]
worker_body = worker_body.replace('    workerHarness =', '    RunnerProcessHarness workerHarness =', 1)
worker_body = worker_body.replace('    workerHarness.awaitReady(Duration.ofSeconds(60));', '    return workerHarness;') + '\n'
cleanup = method(original, 'closeWorker')[2]
cleanup_body = cleanup[cleanup.index('    if (harness != null)'):cleanup.rindex('\n  }')]
assert cleanup_body in method(SOURCES[NAMES[1]], 'closeWorker')[2]

imports = '''package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.support.RunnerProcessHarness;
import com.citi.put.checks.studio.support.RunnerTestTls;
import com.citi.put.checks.studio.support.RunnerTestTls.Identity;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.SSLContext;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Shared transport/application fixture with one independently owned instance per bridge test class.
 * Planning, source access, reservations, and admission authority remain in their respective tests.
 * The support-folder location intentionally retains the tests' declared guided.session package.
 */
final class GuidedBridgeFixture {
'''
fixture = imports + field_text
fixture += '  GuidedBridgeFixture(String temporaryPrefix, Path workerEvidencePath) throws Exception {\n'
fixture += '\n'.join(line[2:] if line.startswith('  ') else line for line in constructor.splitlines()) + '\n  }\n\n'
fixture += '  void start() {\n' + '\n'.join(line[2:] if line.startswith('  ') else line for line in start_body.splitlines()) + '\n  }\n\n'
fixture += '\n\n'.join(shared_methods) + '\n\n'
fixture += '  String prepareScenario(org.junit.jupiter.api.TestInfo testInfo) {\n' + scenario_body + '    return testName;\n  }\n\n'
fixture += '  void isolateDatabase(DataSource fixtureDataSource) {\n' + database_body + '  }\n\n'
fixture += '  void resetWorkerState() {\n' + reset_body + '  }\n\n'
fixture += '  Path prepareWorkerJournal() throws Exception {\n' + journal_body + '    return journal;\n  }\n\n'
fixture += '  RunnerProcessHarness startWorker(Path journal, int backendPort) throws Exception {\n' + worker_body + '  }\n\n'
fixture += '  void closeWorker(RunnerProcessHarness harness) throws Exception {\n' + cleanup_body + '\n  }\n}\n'
# Instance fields use normal member names; no mutable resource becomes a shared static.
for m in reversed(list(re.finditer(r'\b(?:' + '|'.join(FIELDS) + r')\b', masked(fixture)))):
    fixture = fixture[:m.start()] + FIELD_RENAMES[m[0]] + fixture[m.end():]
for imp in re.findall(r'^import (?!static )([\w.]+);\n', fixture, re.M):
    rest = re.sub(r'^import .*;\n', '', fixture, flags=re.M)
    if not re.search(r'\b' + imp.rsplit('.', 1)[1] + r'\b', masked(rest)):
        fixture = fixture.replace('import ' + imp + ';\n', '')

# Remove only genuinely orphaned, non-overriding Integration helpers. The transitive
# orphan closure is checked after deletion, not just a one-level grep.
ORPHANS = ['action', 'navigation', 'advanceRequest', 'race', 'proposalByLocator', 'refreshRequest',
           'proposal', 'advance', 'operationHash']
removed = {}
candidates = {}
wait_rows = []
for classname, s in SOURCES.items():
    fields_at = s.index('  static final GuidedContracts CONTRACTS')
    if classname == NAMES[0]:
        s = s[:fields_at] + '  static final GuidedBridgeFixture ENV;\n\n' + s[s.index('  static {', fields_at):]
    else:
        extra_at = s.index('  // aria-bridge-ruling01 N5:')
        s = s[:fields_at] + '  static final GuidedBridgeFixture ENV;\n\n' + s[extra_at:]
    init_at = s.index('      TEMP = Files.createTempDirectory')
    if classname == NAMES[0]:
        end_at = s.index('    } catch (Exception failure)', init_at)
        s = s[:init_at] + '      ENV = new GuidedBridgeFixture(\n          "guided-bridge-", Path.of("/tmp/studio-obs004-tested-worker.json"));\n      ENV.start();\n' + s[end_at:]
    else:
        provider_at = s.index('      PROVIDER = HttpServer.create(', init_at)
        s = s[:init_at] + '      ENV = new GuidedBridgeFixture(\n          "guided-bridge-planned-", Path.of("/tmp/studio-obs015-bridge-planned-worker.json"));\n' + s[provider_at:]
        app_at = s.index('      APPLICATION.start();')
        end_at = s.index('    } catch (Exception failure)', app_at)
        # PROVIDER.start() is immediately before this block and remains there.
        s = s[:app_at] + '      ENV.start();\n' + s[end_at:]
    s = replace_method(s, 'properties', '  static void properties(DynamicPropertyRegistry registry) {\n    ENV.properties(registry);\n  }')
    s = replace_method(s, 'governedPolicy', '  static ObjectNode governedPolicy() {\n    return ENV.governedPolicy();\n  }')
    s = replace_method(s, 'token', '  static String token(String role, String subject, String audience) {\n    return ENV.token(role, subject, audience);\n  }')
    s = replace_method(s, 'completionFault', '    org.springframework.boot.web.servlet.FilterRegistrationBean<jakarta.servlet.Filter>\n        completionFault() {\n      return ENV.completionFault();\n    }')
    # Original completionFault starts at four spaces; method() includes two of them.
    s = s.replace('      org.springframework.boot.web.servlet.FilterRegistrationBean<jakarta.servlet.Filter>\n', '    org.springframework.boot.web.servlet.FilterRegistrationBean<jakarta.servlet.Filter>\n')
    scenario_call = ('    String testName = ENV.prepareScenario(testInfo);\n' if classname == NAMES[1]
                     else '    ENV.prepareScenario(testInfo);\n')
    s = s.replace(scenario_body, scenario_call, 1)
    s = s.replace(database_body, '    ENV.isolateDatabase(fixtureDataSource);\n', 1)
    s = s.replace(reset_body, '    ENV.resetWorkerState();\n', 1)
    s = s.replace(journal_body, '    Path journal = ENV.prepareWorkerJournal();\n', 1)
    old_worker = before[worker_start:worker_end]
    assert old_worker in s
    s = s.replace(old_worker, '    workerHarness = ENV.startWorker(journal, backendPort);\n    workerHarness.awaitReady(Duration.ofSeconds(60));', 1)
    assert cleanup_body in s
    s = s.replace(cleanup_body, '    ENV.closeWorker(harness);', 1)
    if classname == NAMES[0]:
        removed[classname] = {}
        for name in ORPHANS:
            a, b, text = method(s, name)
            assert '@Override' not in text
            removed[classname][name] = text
            s = s[:a] + s[b:]
        for name in ORPHANS:
            assert not re.search(r'\b' + name + r'\s*\(', masked(s)), name
    # Shared await wrapper is removed; explicit old timing at each real call site.
    calls = list(re.finditer(r'(?m)^    (?:  )?await\(\(\) -> (.*), (\d+)\);$', s))
    for m in reversed(calls):
        indent = re.match(r' *', m[0])[0]
        expr, timeout = m[1], m[2]
        condition_name = ('teardown confirmed' if 'teardownStatus' in expr else
                          'three refused stops finish' if 'lost.get()' in expr else
                          'owner renewal recorded' if 'claimCount' in expr else
                          'terminal failure recorded' if 'FAILED' in expr else
                          'DOM replacement receipt' if 'MUTATIONS' in expr else
                          'first lease plus 500 ms' if 'firstLease' in expr else
                          'application fill receipt')
        alias = classname + ': ' + condition_name
        replacement = (indent + 'org.awaitility.Awaitility.await()\n' + indent + '    .alias("' + alias + '")\n'
                       + indent + '    .pollInSameThread()\n' + indent + '    .pollDelay(Duration.ZERO)\n'
                       + indent + '    .pollInterval(Duration.ofMillis(25))\n'
                       + indent + '    .atMost(Duration.ofMillis(' + timeout + '))\n'
                       + indent + '    .until(() -> ' + expr + ');\n'
                       + indent + 'assertThat(' + expr + ').isTrue();')
        wait_rows.append({'class': classname, 'expression': expr, 'timeoutMillis': int(timeout),
                          'pollIntervalMillis': 25, 'pollDelayMillis': 0, 'sameThread': True,
                          'finalOriginalAssertionRetained': True})
        s = s[:m.start()] + replacement + s[m.end():]
    assert len(calls) == 7, (classname, len(calls))
    s = replace_method(s, 'await', '')
    s = namespaced(s, FIELDS)
    s = s.replace('ENV.ENV.', 'ENV.')
    for name, replacement in FIELD_RENAMES.items():
        s = re.sub(r'\bENV\.' + name + r'\b', 'ENV.' + replacement, s)
    # Remove imports whose simple name has no remaining code use (not comments/strings).
    for imp in re.findall(r'^import (?!static )([\w.]+);\n', s, re.M):
        simple = imp.rsplit('.', 1)[1]
        rest = re.sub(r'^import .*;\n', '', s, flags=re.M)
        if not re.search(r'\b' + simple + r'\b', masked(rest)):
            s = s.replace('import ' + imp + ';\n', '')
    s = re.sub(r'\n(?:[ \t]*\n){2,}', '\n\n', s)
    candidates[classname] = s

fixture_path = BASE / 'support/GuidedBridgeFixture.java'
paths = {}
for name, s in candidates.items():
    paths[BASE / (name + '.java')] = s
paths[fixture_path] = fixture
for rel, content in paths.items():
    target = OUT / 'candidates' / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    prior = ROOT / rel
    if prior.exists():
        snapshot = OUT / 'preimages' / rel
        snapshot.parent.mkdir(parents=True, exist_ok=True)
        snapshot.write_bytes(prior.read_bytes())
patch = ''.join(''.join(difflib.unified_diff((ROOT / p).read_text().splitlines(keepends=True) if (ROOT / p).exists() else [],
                                        text.splitlines(keepends=True), fromfile='a/' + str(p) if (ROOT / p).exists() else '/dev/null',
                                        tofile='b/' + str(p))) for p, text in paths.items())
(OUT / 'candidate.patch').write_text(patch)
(OUT / 'wait-call-sites.json').write_text(json.dumps(wait_rows, indent=2) + '\n')
(OUT / 'orphan-helpers.json').write_text(json.dumps(removed, indent=2) + '\n')
print(json.dumps({'output': str(OUT), 'paths': len(paths), 'explicitWaits': len(wait_rows),
                  'patchSha256': hashlib.sha256(patch.encode()).hexdigest()}, indent=2))
