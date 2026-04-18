package com.citi.put.checks.security;

/**
 * PROVISIONAL stub — returns strawman payloads matching the DRAFT bff-identity-contract.md. Replace
 * with real CoreServiceClient once Core-team sign-off lands (story 1.4 AC-3).
 */
public class FakeCoreServiceClient {

  public String getUsersMe() {
    return """
                {
                  "user_id": "alice@citi.com",
                  "email": "alice@citi.com",
                  "name": "Alice Brown",
                  "department": "Global Ops",
                  "roles": ["checks-operator"],
                  "csi_ownership": [
                    { "csi_id": "174523", "role": "owner" },
                    { "csi_id": "99887", "role": "contributor" }
                  ]
                }
                """;
  }

  public String getUsersMeAdmin() {
    return """
                {
                  "user_id": "bob@citi.com",
                  "email": "bob@citi.com",
                  "name": "Bob Smith",
                  "department": "Platform Engineering",
                  "roles": ["checks-admin", "platform-admin"],
                  "csi_ownership": []
                }
                """;
  }

  public String checkAuthorizationAllowed() {
    return """
                {
                  "allowed": true
                }
                """;
  }

  public String checkAuthorizationDenied() {
    return """
                {
                  "allowed": false,
                  "reason": "User has contributor role on CSI 99887; bulk execute requires owner."
                }
                """;
  }
}
