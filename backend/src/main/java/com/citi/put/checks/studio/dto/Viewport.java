package com.citi.put.checks.studio.dto;

/**
 * Browser viewport in CSS pixels.
 *
 * <p>Replaces the flattened {@code viewportWidth}/{@code viewportHeight} request fields
 * (Architecture §8.3). The legacy flattened form is still accepted and folded into this record by
 * {@link LegacyStudioAdapter}.
 */
public record Viewport(Integer width, Integer height) {

  public static final int DEFAULT_WIDTH = 1920;
  public static final int DEFAULT_HEIGHT = 1080;

  public static Viewport defaults() {
    return new Viewport(DEFAULT_WIDTH, DEFAULT_HEIGHT);
  }
}
