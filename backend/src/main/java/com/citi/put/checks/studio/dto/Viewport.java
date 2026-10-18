package com.citi.put.checks.studio.dto;

/** Browser viewport in CSS pixels. */
public record Viewport(Integer width, Integer height) {

  public static final int DEFAULT_WIDTH = 1920;
  public static final int DEFAULT_HEIGHT = 1080;

  public static Viewport defaults() {
    return new Viewport(DEFAULT_WIDTH, DEFAULT_HEIGHT);
  }
}
