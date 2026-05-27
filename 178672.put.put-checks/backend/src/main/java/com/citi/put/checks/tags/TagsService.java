package com.citi.put.checks.tags;

import com.citi.put.checks.tags.dto.TagStatsDto;
import com.citi.put.checks.tags.dto.TagSuggestionsRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TagsService {

  @PersistenceContext private EntityManager em;

  /**
   * List distinct tag names, optionally filtered by CSI. When a csiId is provided the result
   * includes tags attached to checks belonging to that CSI (via check_tags) plus tags attached
   * directly to the CSI (via csi_tags). Results are sorted alphabetically.
   */
  public Map<String, Object> listTags(String csiId) {
    List<String> tags;
    if (csiId != null && !csiId.isBlank()) {
      tags = listTagsByCsi(csiId);
    } else {
      tags = listAllTags();
    }
    return Map.of("data", tags, "total", tags.size());
  }

  /**
   * Tag usage statistics: each tag with the number of checks that carry it, optionally scoped to a
   * single CSI. Sorted by count descending.
   */
  public Map<String, Object> tagStats(String csiId) {
    List<TagStatsDto> stats;
    int totalChecks;

    if (csiId != null && !csiId.isBlank()) {
      stats = statsByCsi(csiId);
      totalChecks = countChecksByCsi(csiId);
    } else {
      stats = statsAll();
      totalChecks = countAllChecks();
    }

    return Map.of("data", stats, "totalTags", stats.size(), "totalChecks", totalChecks);
  }

  /**
   * Suggest co-occurring tags. Given a set of selected tags, find all checks that have ANY of those
   * tags, collect the other tags from those checks, rank by frequency, exclude the already-selected
   * tags, and return the top 10.
   */
  public Map<String, Object> suggestions(TagSuggestionsRequest request) {
    List<String> selectedTags = request.selectedTags();
    if (selectedTags == null || selectedTags.isEmpty()) {
      return Map.of("data", Collections.emptyList());
    }

    String csiId = request.csiId();
    List<String> suggestions;

    if (csiId != null && !csiId.isBlank()) {
      suggestions = suggestWithCsi(selectedTags, csiId);
    } else {
      suggestions = suggestAll(selectedTags);
    }

    return Map.of("data", suggestions);
  }

  // ── private query helpers ─────────────────────────────────────────────

  private List<String> listAllTags() {
    @SuppressWarnings("unchecked")
    List<String> result =
        em.createNativeQuery("SELECT t.name FROM tags t ORDER BY t.name").getResultList();
    return result;
  }

  private List<String> listTagsByCsi(String csiId) {
    @SuppressWarnings("unchecked")
    List<String> result =
        em.createNativeQuery(
                """
                SELECT DISTINCT t.name
                FROM tags t
                WHERE t.id IN (
                    SELECT ct.tag_id
                    FROM check_tags ct
                    JOIN checks c ON c.id = ct.check_id
                    WHERE c.csi_id = :csiId AND c.deleted_at IS NULL
                    UNION
                    SELECT cst.tag_id
                    FROM csi_tags cst
                    WHERE cst.csi_id = :csiId
                )
                ORDER BY t.name
                """)
            .setParameter("csiId", csiId)
            .getResultList();
    return result;
  }

  private List<TagStatsDto> statsAll() {
    @SuppressWarnings("unchecked")
    List<Object[]> rows =
        em.createNativeQuery(
                """
                SELECT t.name, COUNT(ct.check_id)::int AS cnt
                FROM tags t
                JOIN check_tags ct ON ct.tag_id = t.id
                JOIN checks c ON c.id = ct.check_id AND c.deleted_at IS NULL
                GROUP BY t.name
                ORDER BY cnt DESC, t.name
                """)
            .getResultList();
    return toStatsDtos(rows);
  }

  private List<TagStatsDto> statsByCsi(String csiId) {
    @SuppressWarnings("unchecked")
    List<Object[]> rows =
        em.createNativeQuery(
                """
                SELECT t.name, COUNT(ct.check_id)::int AS cnt
                FROM tags t
                JOIN check_tags ct ON ct.tag_id = t.id
                JOIN checks c ON c.id = ct.check_id AND c.deleted_at IS NULL
                WHERE c.csi_id = :csiId
                GROUP BY t.name
                ORDER BY cnt DESC, t.name
                """)
            .setParameter("csiId", csiId)
            .getResultList();
    return toStatsDtos(rows);
  }

  private int countAllChecks() {
    Number n =
        (Number)
            em.createNativeQuery("SELECT COUNT(*) FROM checks WHERE deleted_at IS NULL")
                .getSingleResult();
    return n.intValue();
  }

  private int countChecksByCsi(String csiId) {
    Number n =
        (Number)
            em.createNativeQuery(
                    "SELECT COUNT(*) FROM checks WHERE csi_id = :csiId AND deleted_at IS NULL")
                .setParameter("csiId", csiId)
                .getSingleResult();
    return n.intValue();
  }

  private List<String> suggestAll(List<String> selectedTags) {
    @SuppressWarnings("unchecked")
    List<String> result =
        em.createNativeQuery(
                """
                SELECT t2.name
                FROM check_tags ct1
                JOIN check_tags ct2 ON ct2.check_id = ct1.check_id
                JOIN tags t1 ON t1.id = ct1.tag_id
                JOIN tags t2 ON t2.id = ct2.tag_id
                JOIN checks c ON c.id = ct1.check_id AND c.deleted_at IS NULL
                WHERE t1.name IN (:selectedTags)
                  AND t2.name NOT IN (:selectedTags)
                GROUP BY t2.name
                ORDER BY COUNT(*) DESC, t2.name
                LIMIT 10
                """)
            .setParameter("selectedTags", selectedTags)
            .getResultList();
    return result;
  }

  private List<String> suggestWithCsi(List<String> selectedTags, String csiId) {
    @SuppressWarnings("unchecked")
    List<String> result =
        em.createNativeQuery(
                """
                SELECT t2.name
                FROM check_tags ct1
                JOIN check_tags ct2 ON ct2.check_id = ct1.check_id
                JOIN tags t1 ON t1.id = ct1.tag_id
                JOIN tags t2 ON t2.id = ct2.tag_id
                JOIN checks c ON c.id = ct1.check_id AND c.deleted_at IS NULL
                WHERE t1.name IN (:selectedTags)
                  AND t2.name NOT IN (:selectedTags)
                  AND c.csi_id = :csiId
                GROUP BY t2.name
                ORDER BY COUNT(*) DESC, t2.name
                LIMIT 10
                """)
            .setParameter("selectedTags", selectedTags)
            .setParameter("csiId", csiId)
            .getResultList();
    return result;
  }

  private List<TagStatsDto> toStatsDtos(List<Object[]> rows) {
    return rows.stream().map(row -> new TagStatsDto((String) row[0], (Integer) row[1])).toList();
  }
}
