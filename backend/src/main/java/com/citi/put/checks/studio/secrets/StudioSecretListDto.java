package com.citi.put.checks.studio.secrets;

import java.util.List;

/**
 * The {@code 200} body of a test's secret list.
 *
 * @param data the stored secret names, sorted
 */
public record StudioSecretListDto(List<StudioSecretNameDto> data) {}
