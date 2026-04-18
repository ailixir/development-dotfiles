package com.citi.put.checks.csi;

import com.citi.put.checks.csi.dto.CsiDto;
import com.citi.put.checks.csi.entity.CsiSystem;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CsiService {

  private static final Set<String> ADMIN_ROLES = Set.of("checks-admin", "platform-admin");

  private final CsiRepository csiRepository;

  public CsiService(CsiRepository csiRepository) {
    this.csiRepository = csiRepository;
  }

  public Page<CsiDto> listCsi(
      UserIdentity identity,
      String businessUnit,
      String criticality,
      String environment,
      String status,
      String search,
      int page,
      int size) {
    Pageable pageable = PageRequest.of(page, Math.min(size, 100), Sort.by("name").ascending());

    Page<CsiSystem> result;
    if (isAdmin(identity)) {
      result =
          csiRepository.findAllFiltered(
              businessUnit, criticality, environment, status, search, pageable);
    } else {
      List<String> ownedCsiIds =
          identity.csiOwnership().stream()
              .map(CsiOwnershipEntry::csiId)
              .collect(Collectors.toList());
      if (ownedCsiIds.isEmpty()) {
        ownedCsiIds = List.of("__none__");
      }
      result =
          csiRepository.findAllVisibleToFiltered(
              ownedCsiIds, businessUnit, criticality, environment, status, search, pageable);
    }

    return result.map(CsiDto::from);
  }

  public CsiDto findById(String id) {
    return csiRepository.findById(id).map(CsiDto::from).orElse(null);
  }

  private boolean isAdmin(UserIdentity identity) {
    return identity.roles().stream().anyMatch(ADMIN_ROLES::contains);
  }
}
