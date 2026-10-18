-- V4__secrets_encrypted_value.sql
-- Story 3.12: Add encrypted_value column to secrets table for M3 stub encryption.

ALTER TABLE secrets ADD COLUMN IF NOT EXISTS encrypted_value BYTEA;
