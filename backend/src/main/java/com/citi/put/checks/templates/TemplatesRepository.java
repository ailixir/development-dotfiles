package com.citi.put.checks.templates;

import com.citi.put.checks.templates.entity.CheckTemplate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TemplatesRepository extends JpaRepository<CheckTemplate, String> {

  @Query(
      """
      SELECT t FROM CheckTemplate t
      WHERE (:type IS NULL OR t.type = :type)
        AND (:search IS NULL
             OR LOWER(t.title) LIKE :search
             OR LOWER(t.description) LIKE :search)
      """)
  List<CheckTemplate> findAllFiltered(@Param("type") String type, @Param("search") String search);
}
