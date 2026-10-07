package com.citi.put.checks.studio.secrets;

import java.util.List;

/**
 * The {@code 201} body of a secret create. There is deliberately no value field.
 *
 * @param name the stored secret name
 * @param version the stored entry's nonsecret Vault version
 * @param allowedOrigins the normalized origins the entry was stored with
 */
public record StudioSecretDto(String name, String version, List<String> allowedOrigins) {}
