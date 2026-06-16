package com.citi.put.checks.csi;

import com.citi.put.checks.csi.dto.CsiDto;
import com.citi.put.checks.csi.dto.CsiSearchResult;
import com.citi.put.checks.csi.entity.CsiSystem;
import java.util.List;
import java.util.Optional;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "checks.csi.provider", havingValue = "local", matchIfMissing = true)
public class JpaCsiApiClient implements CsiApiClient {

  private final CsiRepository csiRepository;

  public JpaCsiApiClient(CsiRepository csiRepository) {
    this.csiRepository = csiRepository;
  }

  @Override
  public Page<CsiDto> listFiltered(
      List<String> ownedCsiIds,
      boolean isAdmin,
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
    if (isAdmin) {
      result =
          csiRepository.findAllFiltered(
              businessUnit, criticality, environment, status, searchPattern, pageable);
    } else {
      List<String> ids = ownedCsiIds.isEmpty() ? List.of("__none__") : ownedCsiIds;
      result =
          csiRepository.findAllVisibleToFiltered(
              ids, businessUnit, criticality, environment, status, searchPattern, pageable);
    }

    return result.map(CsiDto::from);
  }

  @Override
  public Optional<CsiDto> findById(String id) {
    return csiRepository.findById(id).map(CsiDto::from);
  }

  @Override
  public List<CsiSearchResult> search(String query, int limit) {
    String pattern = "%" + query.toLowerCase() + "%";
    return csiRepository.search(pattern, PageRequest.of(0, limit)).stream()
        .map(c -> new CsiSearchResult(c.getId(), c.getName()))
        .toList();
  }
}
