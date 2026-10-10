package com.citi.put.checks.studio.guided.account;

import com.citi.put.checks.studio.guided.publication.PublicationContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;

/** Neutral account capability ABI. Only the later account provider supplies connection state. */
public interface ReplayAccountAccess {
  record ReplayAccountRequest(JsonNode document) {
    public ReplayAccountRequest {
      document = PublicationContracts.bounded(document, 8192);
    }

    @Override
    public JsonNode document() {
      return document.deepCopy();
    }
  }

  record AccountAuthorization(JsonNode document) {
    public AccountAuthorization {
      document = PublicationContracts.bounded(document, 8192);
    }

    @Override
    public JsonNode document() {
      return document.deepCopy();
    }
  }

  record AccountHandle(JsonNode document) {
    public AccountHandle {
      document = PublicationContracts.bounded(document, 8192);
    }

    @Override
    public JsonNode document() {
      return document.deepCopy();
    }

    @Override
    public String toString() {
      return "AccountHandle[redacted]";
    }
  }

  AccountAuthorization authorize(ReplayAccountRequest request);

  AccountHandle issueHandle(AccountAuthorization authorization, JsonNode replayGrant);

  boolean isCurrent(AccountAuthorization authorization, Instant now);

  static ReplayAccountAccess unavailable() {
    return new ReplayAccountAccess() {
      @Override
      public AccountAuthorization authorize(ReplayAccountRequest request) {
        throw new GuidedSessionException("AUTH_CONNECTION_REQUIRED", 409);
      }

      @Override
      public AccountHandle issueHandle(AccountAuthorization authorization, JsonNode replayGrant) {
        throw new GuidedSessionException("AUTH_CONNECTION_REQUIRED", 409);
      }

      @Override
      public boolean isCurrent(AccountAuthorization authorization, Instant now) {
        return false;
      }
    };
  }
}
