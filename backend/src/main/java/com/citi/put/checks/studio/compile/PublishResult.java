package com.citi.put.checks.studio.compile;

/** Outcome of publishing an asynchronous compile result (Architecture §4.2). */
public enum PublishResult {
  /** The result was published; the draft moved to the corresponding compile state. */
  PUBLISHED,
  /**
   * The draft moved on (newer compile request or newer source revision) before this result arrived,
   * so the result was discarded. Includes an older compile for the same text.
   */
  DISCARDED_OUT_OF_ORDER
}
