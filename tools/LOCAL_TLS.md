# Local Studio runner TLS

`dev.sh` prepares a private, ephemeral CA and separate backend/runner certificates before touching ports. The certificates have localhost/127.0.0.1 SANs and both TLS server/client usages. A random password file protects the backend PKCS12 and CA trust store. All generated material stays in the launch's private runner work directory and is removed by its existing cleanup. OpenSSL, Node 24 and the configured JDK's `keytool` are required; no global trust store changes occur.

The ordinary runner uses HTTPS with mutual TLS and its existing bearer identities. Its strict readiness request presents the backend certificate and bearer header from private configuration; credentials are never command arguments. The helper replaces itself with the sole production runner entry point, preserving the launcher-owned PID and drain behavior. Guided mode, governance and provider credentials are configured separately; this helper does not provision them.

To supply your own identities, set all eight keys below. A partial or invalid configuration fails before port cleanup; it never mixes generated trust with operator material:

- `STUDIO_RUNNER_TLS_KEY_FILE`, `STUDIO_RUNNER_TLS_CERT_FILE`, `STUDIO_RUNNER_TLS_CA_FILE`
- `STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256` (backend leaf, uppercase colon-separated SHA256)
- `STUDIO_RUNNER_TLS_KEY_STORE`, `STUDIO_RUNNER_TLS_KEY_STORE_PASSWORD_FILE`
- `STUDIO_RUNNER_TLS_TRUST_STORE`, `STUDIO_RUNNER_TLS_TRUST_STORE_PASSWORD_FILE`

Optional `STUDIO_RUNNER_TLS_KEY_STORE_TYPE` and `STUDIO_RUNNER_TLS_TRUST_STORE_TYPE` default to `PKCS12`; `JKS` is also accepted. Key/store/password files must have no group/other permissions. Leaves must carry both TLS usages and loopback SANs, keys must match certificates, and each side must trust its peer. Operator files remain untouched; the helper creates only private launch-scoped health material.

The runner CA file authenticates incoming backend clients; the backend trust store authenticates the runner server. These may use independent issuers. Health uses the backend trust store, and preserves the backend key store's complete certificate chain, including intermediates. Both leaves must explicitly include the serverAuth and clientAuth EKU OIDs; an omitted EKU is rejected before port cleanup.

Run the focused helper checks with `node --test tools/tests/studio-local-tls.test.mjs`. These use temporary directories and an owned ephemeral mTLS listener. They do not execute `dev.sh`, kill ports, start watchers, call a model, or modify the current development stack.
