-- STUDIO-OBS-012A / ADR-SC-005 D-B: Studio re-baseline, area 7 of 7 (plaintext secrets removal).
-- Pre-release baseline on top of untouched core V1–V11; forward-only again from here (ARCH.md:123).

-- studio-vault-secrets (V1): Vault KV v2 is the only secret store. Studio saves a secret straight to
-- Vault at studio/{csiId}/{environment}/{testId}/secrets/{name}; nothing reads this table any more.
--
-- Forward-only. The rows are purged, not migrated: they held plaintext that must not be copied
-- anywhere (user decision 1 / ASM-3). idx_secrets_owner and idx_secrets_scope go with the table.
-- No foreign key references it: V1 (CREATE) and V4 (encrypted_value) are the only migrations that
-- name it (grep-verified).
DROP TABLE IF EXISTS secrets;
