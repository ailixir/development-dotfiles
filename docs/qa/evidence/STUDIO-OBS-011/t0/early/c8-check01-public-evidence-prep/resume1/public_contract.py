"""Pure producer reference and strict collector. No filesystem, HTTP, runtime adapter or main."""
import json
import re

CONSTANTS = {'unit': 'obs011-t0-c8-public-error-observe01', 'class': 'com.citi.put.checks.studio.guided.publication.GuidedPublicationReplayIT', 'method': 'actualPublishedWrongPasswordAnnotatesEarlierSecretFill', 'baseSourceDigest': 'f9cbe66dd1aa700ebbb578203e84f6b24ec329b092e7f78c7ee9e12ab8dc9277', 'replayPreimageSha256': 'b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475', 'planManifestSha256': '190235dc5dec26fb3603deed1f9147b25778a6668dd9fb1828a067965f0ed30a'}
STATES = frozenset(['FINALIZING', 'FAILED', 'EXPIRED', 'UNKNOWN_OUTCOME', 'CANCELLED', 'UNKNOWN'])
CODES = frozenset(['OK', 'PENDING', 'INVALID_CONTRACT', 'UNAUTHENTICATED', 'FORBIDDEN_SCOPE', 'REVISION_CONFLICT', 'STALE_GENERATION', 'TARGET_MISMATCH', 'AMBIGUOUS_TARGET', 'MISSING_SOURCE', 'BINDING_ORDER', 'SENSITIVE_SOURCE', 'ORIGIN_NOT_ALLOWED', 'UNSUPPORTED_SURFACE', 'BUDGET_EXCEEDED', 'STALE_FENCE', 'IDEMPOTENCY_CONFLICT', 'UNKNOWN_OUTCOME', 'PUBLICATION_CONFLICT', 'RUNTIME_INCOMPATIBLE', 'ASSERTION_FAILED', 'CANCELLED', 'EXPIRED', 'SECRET_UNAVAILABLE', 'SECRET_USE_NOT_AUTHORIZED', 'SECRET_USE_REVOKED', 'VAULT_UNAVAILABLE', 'LOGIN_REQUIRED', 'SECRET_TOO_LONG', 'ACK_LOST', 'TIMEOUT', 'TARGET_CHANGED', 'POLICY_DENIED', 'REFERENCE_MISMATCH', 'UNKNOWN'])
STATUSES = frozenset(['CAPTURED', 'NOT_REPRODUCED', 'NO_DECISION', 'UNAVAILABLE', 'MISMATCH', 'INVALID', 'AMBIGUOUS'])
FIELDS = frozenset({"schemaVersion", "captureStatus", "pollState", "publicOutcomeOrState", "errorCode", "codeQualified"}) | frozenset(CONSTANTS)
PROVENANCE_FIELDS = frozenset({"rootReleaseSha256", "observerPostimageSha256", "schemaSha256", "collectorSha256"})


def closed(value, allowed):
    return value if type(value) is str and value in allowed else "UNKNOWN"


def record(poll="UNKNOWN", status="UNAVAILABLE"):
    return {"schemaVersion": 1, **CONSTANTS, "captureStatus": status,
            "pollState": closed(poll, STATES), "publicOutcomeOrState": "UNKNOWN",
            "errorCode": "UNKNOWN", "codeQualified": False}


def pairs(items):
    out = {}
    for key, value in items:
        if key in out:
            raise ValueError("DUPLICATE_MEMBER")
        out[key] = value
    return out


def strict_json(raw):
    if type(raw) is not bytes or len(raw) > 1048576:
        raise ValueError("BOUNDED_BYTES_REQUIRED")
    return json.loads(raw.decode("utf-8", errors="strict"), object_pairs_hook=pairs,
                      parse_constant=lambda unused: (_ for _ in ()).throw(ValueError("NONFINITE")))


def project(poll, body, response_status=200):
    """Exact Java projection branch, after a scoped one-send 200 and internal ownership proof.

    The caller verifies the subject separately; no identifier enters this output.
    """
    out = record(poll)
    if type(body) is not dict:
        out["captureStatus"] = "INVALID"
        return out
    outcome = closed(body.get("outcome" if response_status == 200 else "state"), STATES)
    out["publicOutcomeOrState"] = outcome
    if poll != outcome:
        out["captureStatus"] = "MISMATCH"
    elif response_status == 202:
        out["captureStatus"] = "INVALID"
        out["publicOutcomeOrState"] = "UNKNOWN"
    else:
        out["captureStatus"] = "CAPTURED"
        if poll == "FAILED":
            out["errorCode"] = closed(body.get("errorCode"), CODES)
            out["codeQualified"] = out["errorCode"] != "UNKNOWN"
    return out


class ProducerReference:
    """In-memory faithful case/ownership/single-flight counterpart; send/write are mandatory fakes.

    Java executes HTTP and no-follow output prospectively. This class never does either.
    """
    def __init__(self):
        self.subject = None
        self.cookie = None
        self.ambiguous = False
        self.consumed = False

    def bind(self, subject, cookie):
        if self.subject is not None:
            self.ambiguous = True
        else:
            self.subject, self.cookie = subject, cookie

    def observe(self, subject, poll, current_cookie, owned, send, write):
        if self.subject is None or self.subject != subject or self.consumed:
            return None
        self.consumed = True
        out = record(poll)
        try:
            if self.ambiguous or len(owned) != 1:
                out["captureStatus"] = "AMBIGUOUS"
            elif self.cookie is None or self.cookie != current_cookie or self.cookie != owned.get(subject):
                out["captureStatus"] = "INVALID"
            elif poll == "FINALIZING":
                out["captureStatus"] = "NOT_REPRODUCED"
            elif poll not in {"FAILED", "EXPIRED", "UNKNOWN_OUTCOME", "CANCELLED"}:
                out["captureStatus"] = "NO_DECISION"
            else:
                status, raw = send(subject, self.cookie, 15)
                if status not in (200, 202) or len(raw) > 262144:
                    out["captureStatus"] = "UNAVAILABLE"
                else:
                    body = strict_json(raw)
                    if (type(body) is not dict or type(body.get("schemaVersion")) is not int
                        or body["schemaVersion"] != 3 or type(body.get("sessionId")) is not str
                        or body["sessionId"] != subject
                        or (status == 200 and (type(body.get("executionId")) is not str
                            or body["executionId"] != subject or body.get("mode") != "guided" or "state" in body))
                        or (status == 202 and any(k in body for k in ("outcome", "executionId", "mode")))):
                        out["captureStatus"] = "INVALID"
                    else:
                        out = project(poll, body, status)
        except Exception:
            out = record(poll)
        try:
            write(out)
        except Exception:
            pass
        return out


def validate_record(value):
    if type(value) is not dict or set(value) != FIELDS:
        raise ValueError("EXACT_RECORD_FIELDS")
    if type(value["schemaVersion"]) is not int or value["schemaVersion"] != 1:
        raise ValueError("SCHEMA_VERSION")
    if any(type(value[k]) is not str or value[k] != v for k, v in CONSTANTS.items()):
        raise ValueError("EXACT_PUBLIC_PROVENANCE")
    if (type(value["captureStatus"]) is not str or value["captureStatus"] not in STATUSES
        or any(type(value[k]) is not str or value[k] not in STATES
               for k in ("pollState", "publicOutcomeOrState"))
        or type(value["errorCode"]) is not str or value["errorCode"] not in CODES
        or type(value["codeQualified"]) is not bool):
        raise ValueError("CLOSED_TYPES")
    status, poll, outcome, error, qualified = (value[k] for k in
        ("captureStatus", "pollState", "publicOutcomeOrState", "errorCode", "codeQualified"))
    if status == "NOT_REPRODUCED":
        if (poll, outcome, error, qualified) != ("FINALIZING", "UNKNOWN", "UNKNOWN", False):
            raise ValueError("NOT_REPRODUCED_NO_READ")
    elif status == "CAPTURED":
        if poll not in {"FAILED", "EXPIRED", "UNKNOWN_OUTCOME", "CANCELLED"} or outcome != poll:
            raise ValueError("CAPTURED_STATE_AGREEMENT")
        if poll == "FAILED":
            if qualified is not (error != "UNKNOWN"):
                raise ValueError("EXACT_CODE_QUALIFICATION")
        elif error != "UNKNOWN" or qualified:
            raise ValueError("DIFFERENT_TERMINAL_NO_CAUSE")
    elif status == "MISMATCH":
        if poll not in {"FAILED", "EXPIRED", "UNKNOWN_OUTCOME", "CANCELLED"} or outcome == poll or error != "UNKNOWN" or qualified:
            raise ValueError("MISMATCH_NO_QUALIFIED_CODE")
    elif outcome != "UNKNOWN" or error != "UNKNOWN" or qualified:
        raise ValueError("UNQUALIFIED_CLOSED_UNKNOWN")
    if status == "NO_DECISION" and poll != "UNKNOWN":
        raise ValueError("NO_DECISION")
    return value


def collect_records(raw_records, provenance, expected_provenance):
    """Root-bound caller supplies only this public file's bytes, never a private discovery list.

    No first/last selection, no path accepted, and no output outside this closed return value.
    The outer adapter must bind expected_provenance to an actual immutable reviewed release.
    """
    if (type(provenance) is not dict or set(provenance) != PROVENANCE_FIELDS
        or provenance != expected_provenance
        or any(type(v) is not str or re.fullmatch("[0-9a-f]{64}", v) is None for v in provenance.values())):
        raise ValueError("RELEASE_PROVENANCE_REQUIRED")
    if type(raw_records) not in (list, tuple):
        raise ValueError("EXACT_PUBLIC_RECORD_SEQUENCE")
    if not raw_records:
        value = record()
    elif len(raw_records) != 1:
        value = record(status="AMBIGUOUS")
    else:
        try:
            value = validate_record(strict_json(raw_records[0]))
        except (ValueError, UnicodeError, TypeError, RecursionError):
            value = record(status="INVALID")
    return {"publicObservation": value, "provenance": dict(provenance),
            "originalCause": "UNKNOWN", "runtimeStage": "UNKNOWN", "C8Credit": False}
