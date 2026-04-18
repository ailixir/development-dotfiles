package com.citi.put.checks.security;

public class CoreServiceUnauthorizedException extends RuntimeException {

    public CoreServiceUnauthorizedException(String message) {
        super(message);
    }

    public CoreServiceUnauthorizedException(String message, Throwable cause) {
        super(message, cause);
    }
}
