package com.citi.put.checks.checks;

import com.citi.put.checks.checks.dto.CheckDto;
import com.citi.put.checks.checks.dto.CheckRequest;
import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CheckService {

  private static final Set<String> ADMIN_ROLES = Set.of("checks-admin", "platform-admin");

  private final CheckRepository checkRepository;
  private final CsiRepository csiRepository;
  private final CsiOwnershipEvaluator ownershipEvaluator;

  public CheckService(
      CheckRepository checkRepository,
      CsiRepository csiRepository,
      CsiOwnershipEvaluator ownershipEvaluator) {
    this.checkRepository = checkRepository;
    this.csiRepository = csiRepository;
    this.ownershipEvaluator = ownershipEvaluator;
  }

  @Transactional
  public CheckDto create(CheckRequest request, Authentication auth) {
    UserIdentity identity = extractIdentity(auth);
    requireWrite(auth, request.csiId());

    String csiName =
        csiRepository
            .findById(request.csiId())
            .map(csi -> csi.getName())
            .orElseThrow(() -> new IllegalArgumentException("CSI not found: " + request.csiId()));

    Check check =
        new Check(
            request.name(),
            request.configuration().type(),
            request.description(),
            request.csiId(),
            csiName,
            request.configuration(),
            request.environment(),
            identity.email());
    check = checkRepository.save(check);
    return CheckDto.from(check);
  }

  @Transactional(readOnly = true)
  public Page<CheckDto> list(
      UserIdentity identity,
      String csiId,
      String type,
      String status,
      String environment,
      String createdBy,
      String search,
      int page,
      int size) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    String searchPattern = search != null ? "%" + search.toLowerCase() + "%" : null;

    Page<Check> result;
    if (isAdmin(identity)) {
      result =
          checkRepository.findAllFiltered(
              csiId, type, status, environment, createdBy, searchPattern, pageable);
    } else {
      List<String> ownedCsiIds =
          identity.csiOwnership().stream()
              .map(CsiOwnershipEntry::csiId)
              .collect(Collectors.toList());
      if (ownedCsiIds.isEmpty()) {
        ownedCsiIds = List.of("__none__");
      }
      result =
          checkRepository.findAllVisibleToFiltered(
              ownedCsiIds, csiId, type, status, environment, createdBy, searchPattern, pageable);
    }
    return result.map(CheckDto::from);
  }

  @Transactional(readOnly = true)
  public CheckDto findById(UUID id, Authentication auth) {
    Check check = checkRepository.findById(id).orElse(null);
    if (check == null) {
      return null;
    }
    requireRead(auth, check.getCsiId());
    return CheckDto.from(check);
  }

  @Transactional
  public CheckDto update(UUID id, CheckRequest request, Authentication auth) {
    Check check =
        checkRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Check not found: " + id));
    requireWrite(auth, check.getCsiId());

    if (!check.getType().equals(request.configuration().type())) {
      throw new IllegalArgumentException(
          "Cannot change check type from "
              + check.getType()
              + " to "
              + request.configuration().type()
              + ". Delete and recreate instead.");
    }

    check.setName(request.name());
    check.setDescription(request.description());
    check.setConfiguration(request.configuration());
    check.setEnvironment(request.environment());
    check.setUpdatedAt(Instant.now());
    return CheckDto.from(check);
  }

  @Transactional
  public void softDelete(UUID id, Authentication auth) {
    Check check =
        checkRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Check not found: " + id));
    requireWrite(auth, check.getCsiId());
    check.setDeletedAt(Instant.now());
  }

  private void requireRead(Authentication auth, String csiId) {
    if (!ownershipEvaluator.canRead(auth, csiId)) {
      throw new AccessDeniedException("No read access to CSI " + csiId);
    }
  }

  private void requireWrite(Authentication auth, String csiId) {
    if (!ownershipEvaluator.canWrite(auth, csiId)) {
      throw new AccessDeniedException("No write access to CSI " + csiId);
    }
  }

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    throw new AccessDeniedException("Not authenticated");
  }

  private boolean isAdmin(UserIdentity identity) {
    return identity.roles().stream().anyMatch(ADMIN_ROLES::contains);
  }
}
