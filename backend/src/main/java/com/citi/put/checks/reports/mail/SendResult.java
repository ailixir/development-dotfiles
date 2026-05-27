package com.citi.put.checks.reports.mail;

import java.util.List;

public record SendResult(int sent, int failed, List<String> failedRecipients) {

  public boolean allSucceeded() {
    return failed == 0;
  }

  public boolean allFailed() {
    return sent == 0 && failed > 0;
  }
}
