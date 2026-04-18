package com.citi.put.checks.security;

import java.util.stream.Collectors;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

public class BffAuthenticationToken extends AbstractAuthenticationToken {

  private final UserIdentity userIdentity;

  public BffAuthenticationToken(UserIdentity userIdentity) {
    super(
        userIdentity.roles().stream()
            .map(role -> new SimpleGrantedAuthority("ROLE_" + role.toUpperCase().replace("-", "_")))
            .collect(Collectors.toList()));
    this.userIdentity = userIdentity;
    setAuthenticated(true);
  }

  @Override
  public Object getCredentials() {
    return null;
  }

  @Override
  public UserIdentity getPrincipal() {
    return userIdentity;
  }
}
