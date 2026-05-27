package com.citi.put.checks.csi;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.csi.dto.CsiDto;
import com.citi.put.checks.csi.dto.CsiHealthSummary;
import com.citi.put.checks.csi.dto.CsiSearchResult;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class CsiService {

  private static final Set<String> ADMIN_ROLES = Set.of("checks-admin", "platform-admin");

  private final CsiApiClient csiApiClient;
  private final CheckRepository checkRepository;

  public CsiService(CsiApiClient csiApiClient, CheckRepository checkRepository) {
    this.csiApiClient = csiApiClient;
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

    List<String> ownedCsiIds =
        identity.csiOwnership().stream()
            .map(CsiOwnershipEntry::csiId)
            .collect(Collectors.toList());

    return csiApiClient.listFiltered(
        ownedCsiIds, isAdmin(identity), businessUnit, criticality, environment, status, search,
        page, size);
  }

  public CsiDto findById(String id) {
    return csiApiClient.findById(id).orElse(null);
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
        default -> passing += 0;
      }
    }
    String overall = failing > 0 ? "CRITICAL" : warning > 0 ? "WARNING" : "HEALTHY";
    return new CsiHealthSummary(csiId, total, passing, failing, warning, overall, Instant.now());
  }

  public List<CsiSearchResult> search(String query, int limit) {
    return csiApiClient.search(query, limit);
  }

  private boolean isAdmin(UserIdentity identity) {
    return identity.roles().stream().anyMatch(ADMIN_ROLES::contains);
  }
}
