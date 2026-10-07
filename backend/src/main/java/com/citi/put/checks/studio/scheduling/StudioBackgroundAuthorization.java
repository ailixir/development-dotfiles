package com.citi.put.checks.studio.scheduling;

import java.util.List;

/** Unattended grants are independent of authenticated manual execution and of secret-use grants. */
public interface StudioBackgroundAuthorization {
  List<String> principals(String csiId, String environment);

  boolean localOnly();

  void require(String principal, String csiId, String environment);
}
