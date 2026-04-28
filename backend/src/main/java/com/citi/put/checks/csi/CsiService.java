package com.citi.put.checks.csi;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.csi.dto.CsiDto;
import com.citi.put.checks.csi.dto.CsiHealthSummary;
import com.citi.put.checks.csi.dto.CsiSearchResult;
import com.citi.put.checks.csi.entity.CsiSystem;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import java.time.Instant;
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
  private final CheckRepository checkRepository;

  public CsiService(CsiRepository csiRepository, CheckRepository checkRepository) {
    this.csiRepository = csiRepository;
    this.checkRepository = checkRepository;
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
    String searchPattern = search != null ? "%" + search.toLowerCase() + "%" : null;

    Page<CsiSystem> result;
    if (isAdmin(identity)) {
      result =
          csiRepository.findAllFiltered(
              businessUnit, criticality, environment, status, searchPattern, pageable);
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
              ownedCsiIds, businessUnit, criticality, environment, status, searchPattern, pageable);
    }

    return result.map(CsiDto::from);
  }

  public CsiDto findById(String id) {
    return csiRepository.findById(id).map(CsiDto::from).orElse(null);
  }

  public CsiHealthSummary getHealth(String csiId) {
    List<Object[]> rows = checkRepository.countByStatusForCsi(csiId);
    int passing = 0, failing = 0, warning = 0, total = 0;
    for (Object[] row : rows) {
      String status = (String) row[0];
      int count = ((Number) row[1]).intValue();
      total += count;
      switch (status) {
        case "PASSING" -> passing += count;
        case "FAILING" -> failing += count;
        case "WARNING" -> warning += count;
        default -> {}
      }
    }
    String overall = failing > 0 ? "CRITICAL" : warning > 0 ? "WARNING" : "HEALTHY";
    return new CsiHealthSummary(csiId, total, passing, failing, warning, overall, Instant.now());
  }

  public List<CsiSearchResult> search(String query, int limit) {
    String pattern = "%" + query.toLowerCase() + "%";
    return csiRepository.search(pattern, PageRequest.of(0, limit)).stream()
        .map(c -> new CsiSearchResult(c.getId(), c.getName()))
        .toList();
  }

  private boolean isAdmin(UserIdentity identity) {
    return identity.roles().stream().anyMatch(ADMIN_ROLES::contains);
  }
}
