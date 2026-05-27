package com.citi.put.checks.security.event;

import com.citi.put.checks.security.UserIdentity;

public record UserAuthenticatedEvent(UserIdentity identity) {}
