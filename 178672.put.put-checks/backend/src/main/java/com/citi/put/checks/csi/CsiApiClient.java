package com.citi.put.checks.csi;

import com.citi.put.checks.csi.dto.CsiDto;
import com.citi.put.checks.csi.dto.CsiSearchResult;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;

public interface CsiApiClient {

  Page<CsiDto> listFiltered(
      List<String> ownedCsiIds,
      boolean isAdmin,
      String businessUnit,
      String criticality,
      String environment,
      String status,
      String search,
      int page,
      int size);

  Optional<CsiDto> findById(String id);

  List<CsiSearchResult> search(String query, int limit);
}
