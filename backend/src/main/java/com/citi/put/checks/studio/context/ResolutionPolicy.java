package com.citi.put.checks.studio.context;

import com.citi.put.checks.studio.dto.ResolvedOperation;
import com.citi.put.checks.studio.dto.ResolvedTarget;
import java.util.Set;

/**
 * Authoritative allowed-language policy; context can specialize intent but never widen this set.
 */
public record ResolutionPolicy(
    Set<ResolvedOperation.Kind> operations, Set<ResolvedTarget.Strategy> targetStrategies) {

  public ResolutionPolicy {
    operations = Set.copyOf(operations);
    targetStrategies = Set.copyOf(targetStrategies);
  }

  public static ResolutionPolicy compilerLanguage() {
    return new ResolutionPolicy(
        Set.of(ResolvedOperation.Kind.values()), Set.of(ResolvedTarget.Strategy.values()));
  }
}
