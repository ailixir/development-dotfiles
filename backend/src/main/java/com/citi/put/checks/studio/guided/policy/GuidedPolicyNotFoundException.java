package com.citi.put.checks.studio.guided.policy;

/**
 * {@code 404 GUIDED_POLICY_NOT_FOUND} from {@code lookupGuidedPolicy} only, and only after the
 * caller was authorized to read the CSI (ADR-002 §24.3), so it is not an existence oracle.
 */
public class GuidedPolicyNotFoundException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public static final String CODE = "GUIDED_POLICY_NOT_FOUND";

  public GuidedPolicyNotFoundException() {
    super("No governed policy exists for this application environment");
  }
}
