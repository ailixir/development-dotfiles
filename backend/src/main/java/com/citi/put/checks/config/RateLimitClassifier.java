package com.citi.put.checks.config;

import jakarta.servlet.http.HttpServletRequest;

public class RateLimitClassifier {

  public enum BucketClass {
    READ,
    WRITE,
    EXECUTE,
    SEND,
    BULK
  }

  public BucketClass classify(HttpServletRequest request) {
    String method = request.getMethod().toUpperCase();
    String path = request.getRequestURI();

    if ("GET".equals(method)) {
      return BucketClass.READ;
    }

    if (path.matches(".*/checks/_bulk$")) {
      return BucketClass.BULK;
    }

    if (path.matches(".*/checks/[^/]+/execute$")) {
      return BucketClass.EXECUTE;
    }

    // Studio's execute route is POST /api/v1/studio/tests/{id}/execute (StudioController). An
    // earlier pattern matched a `/run` suffix that no controller maps, so every Studio execution
    // was metered as an ordinary WRITE.
    if (path.matches(".*/studio/tests/[^/]+/(execute|verify)$")) {
      return BucketClass.EXECUTE;
    }

    // STUDIO-OBS-014 AC-8 (AR-2 d): starting a guided learning session drives a browser and model
    // calls, so it is metered as EXECUTE. Only the start itself: its sub-routes (cancel, clarify)
    // stay WRITE.
    if (path.matches(".*/studio/guided-sessions$")) {
      return BucketClass.EXECUTE;
    }

    if (path.matches(".*/reports/[^/]+/send$")) {
      return BucketClass.SEND;
    }

    return BucketClass.WRITE;
  }

  public int capacityFor(BucketClass bucketClass, RateLimitProperties props) {
    return switch (bucketClass) {
      case READ -> props.readPerMin();
      case WRITE -> props.writePerMin();
      case EXECUTE -> props.executePerMin();
      case SEND -> props.sendPerMin();
      case BULK -> props.bulkPerMin();
    };
  }
}
