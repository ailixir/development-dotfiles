package com.citi.put.checks.studio.secrets;

/**
 * One item of a test's secret list: a name, never a value.
 *
 * @param name a stored secret name for the test
 */
public record StudioSecretNameDto(String name) {}
