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

    if (path.matches(".*/studio/tests/[^/]+/run$")) {
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
