package com.citi.put.checks.scheduling;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

@ResponseStatus(HttpStatus.CONFLICT)
public class ScheduleConflictException extends RuntimeException {

  public ScheduleConflictException(String message) {
    super(message);
  }
}
