# QA Fix Request — Reports SMTP E2E

**Reviewer:** Quinn (@qa)
**Date:** 2026-05-19
**Branch:** `feat/2.1-schedules-context`
**Verdict:** CONCERNS (4 findings, 2 must-fix)

---

## Must-Fix Before Commit

### FIX-1: CRITICAL — Hardcoded SMTP API Key

**File:** `backend/src/main/resources/application-local.yml:25`

**Problem:** Resend API key `re_fUWH1xsu_JipLZ4UTRCDt8Se4e9t974bw` is hardcoded in a tracked YAML file. Will be committed to git history permanently.

**Fix:**
```yaml
# application-local.yml — replace hardcoded values with env vars (no defaults for secrets)
spring:
  mail:
    host: ${SMTP_HOST:smtp.resend.com}
    port: ${SMTP_PORT:587}
    username: ${SMTP_USER:resend}
    password: ${SMTP_PASSWORD}
    properties:
      mail.smtp.auth: true
      mail.smtp.starttls.enable: true
```

Then add to project `.env.local` (already gitignored):
```
SMTP_PASSWORD=re_fUWH1xsu_JipLZ4UTRCDt8Se4e9t974bw
```

**Note:** Spring Boot does not load `.env` files natively. Either:
- Export the var before running: `export SMTP_PASSWORD=re_fUWH1xsu_JipLZ4UTRCDt8Se4e9t974bw && ./gradlew bootRun`
- Or use the `dev.sh` script to source `.env.local` before launch
- Or add `spring-dotenv` dependency for auto-loading

**Test impact:** None — tests override `spring.mail.host` via `@DynamicPropertySource`, so the password env var is never resolved in tests. When `spring.mail.host` is overridden to `localhost`, Spring creates a new `JavaMailSender` that doesn't need real credentials.

---

### FIX-2: LOW — Delete Orphaned File

**File:** `backend/src/main/resources/application-smtp.yml` (untracked)

**Problem:** Created during the profile-based approach that was abandoned. Contains duplicate credentials and serves no purpose.

**Fix:**
```bash
rm backend/src/main/resources/application-smtp.yml
```

---

## Should-Fix Before Merge

### FIX-3: HIGH — Email Validation on sendTest

**File:** `backend/src/main/java/com/citi/put/checks/reports/ReportsController.java:114`

**Problem:** The `to` parameter from the request body is passed directly to `ReportMailSender.send()` without any validation. Any string is accepted as a recipient address.

**Fix option A — Inline validation in controller:**
```java
@PostMapping("/{id}/send-test")
public ResponseEntity<Map<String, Object>> sendTest(
    @PathVariable UUID id, @RequestBody(required = false) Map<String, String> body) {
  String to = body != null ? body.get("to") : null;
  if (to != null && !to.matches("^[\\w.+-]+@[\\w.-]+\\.[a-zA-Z]{2,}$")) {
    return ResponseEntity.badRequest()
        .body(Map.of("ok", false, "error", "Invalid email address"));
  }
  ReportExecutionDto execution = reportsService.sendTest(id, to);
  return ResponseEntity.ok(Map.of("ok", true, "sentAt", Instant.now(), "execution", execution));
}
```

**Fix option B — Jakarta validation DTO (preferred for consistency):**
Create a `SendTestRequest` record:
```java
public record SendTestRequest(@jakarta.validation.constraints.Email String to) {}
```

Then in controller:
```java
@PostMapping("/{id}/send-test")
public ResponseEntity<Map<String, Object>> sendTest(
    @PathVariable UUID id, @Valid @RequestBody(required = false) SendTestRequest body) {
  String to = body != null ? body.to() : null;
  ...
}
```

---

### FIX-4: MEDIUM — JPA Managed Entity Mutation in sendTest

**File:** `backend/src/main/java/com/citi/put/checks/reports/ReportsService.java:170-177`

**Problem:**
```java
report.setRecipients(new String[] {recipientOverride});  // dirties managed entity
ReportExecutionDto result = deliveryService.deliver(report);  // may flush
report.setRecipients(originalRecipients);  // restore — too late if flushed
```

`report` is a JPA-managed entity. `deliver()` is `@Transactional` and calls `executionRepository.save()` which may trigger a flush, persisting the overridden single-recipient array to the `reports` table.

**Fix — Pass recipients separately (avoids entity mutation entirely):**

In `ReportsService`:
```java
@Transactional
public ReportExecutionDto sendTest(UUID id, String recipientOverride) {
  Report report = findEntity(id);
  String[] recipients = (recipientOverride != null && !recipientOverride.isBlank())
      ? new String[] {recipientOverride}
      : report.getRecipients();
  return deliveryService.deliver(report, recipients);
}
```

In `ReportDeliveryService`, add an overload:
```java
public ReportExecutionDto deliver(Report report, String[] recipientOverride) {
  // ... same render logic ...
  // use recipientOverride instead of report.getRecipients()
  SendResult sendResult = mailSender.get().send(report.getName(), html, recipientOverride);
  // ...
}
```

This keeps the entity clean and avoids any dirty-write risk.

---

## Verification Checklist

After fixes, verify:

- [ ] `./gradlew test` — 267 pass (LogMaskingIT pre-existing failure excluded)
- [ ] `./gradlew bootRun` with `SMTP_PASSWORD` env var — app starts, SMTP bean created
- [ ] `./gradlew bootRun` without `SMTP_PASSWORD` — app fails fast or logs clear error
- [ ] POST `/api/v1/reports/{id}/send-test` with `{"to": "valid@email.com"}` — delivers
- [ ] POST `/api/v1/reports/{id}/send-test` with `{"to": "not-an-email"}` — returns 400
- [ ] POST `/api/v1/reports/{id}/send-test` with empty body — uses report's recipients
- [ ] `application-smtp.yml` deleted
- [ ] No secrets in tracked files: `grep -rn "re_fUWH" backend/src/main/resources/`

---

*Generated by Quinn (@qa) — 2026-05-19*
