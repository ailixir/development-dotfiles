package com.citi.put.checks.tags;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CheckTagService {

  @PersistenceContext private EntityManager em;

  @Transactional(readOnly = true)
  public List<String> findTagNamesByCheckId(UUID checkId) {
    @SuppressWarnings("unchecked")
    List<String> result =
        em.createNativeQuery(
                """
                SELECT t.name FROM tags t
                JOIN check_tags ct ON ct.tag_id = t.id
                WHERE ct.check_id = :checkId
                ORDER BY t.name
                """)
            .setParameter("checkId", checkId)
            .getResultList();
    return result;
  }

  @Transactional(readOnly = true)
  public Map<UUID, List<String>> findTagNamesByCheckIds(Collection<UUID> checkIds) {
    if (checkIds == null || checkIds.isEmpty()) {
      return Collections.emptyMap();
    }
    @SuppressWarnings("unchecked")
    List<Object[]> rows =
        em.createNativeQuery(
                """
                SELECT ct.check_id, t.name FROM tags t
                JOIN check_tags ct ON ct.tag_id = t.id
                WHERE ct.check_id IN (:checkIds)
                ORDER BY t.name
                """)
            .setParameter("checkIds", checkIds)
            .getResultList();

    return rows.stream()
        .collect(
            Collectors.groupingBy(
                row -> (UUID) row[0],
                Collectors.mapping(row -> (String) row[1], Collectors.toList())));
  }

  @Transactional
  public void replaceTagsForCheck(UUID checkId, List<String> tagNames) {
    em.createNativeQuery("DELETE FROM check_tags WHERE check_id = :checkId")
        .setParameter("checkId", checkId)
        .executeUpdate();

    if (tagNames == null || tagNames.isEmpty()) {
      return;
    }

    List<String> sanitized =
        tagNames.stream()
            .filter(t -> t != null && !t.isBlank())
            .map(String::strip)
            .distinct()
            .toList();

    for (String tagName : sanitized) {
      UUID tagId = findOrCreateTag(tagName);
      em.createNativeQuery(
              "INSERT INTO check_tags (check_id, tag_id) VALUES (:checkId, :tagId) ON CONFLICT DO NOTHING")
          .setParameter("checkId", checkId)
          .setParameter("tagId", tagId)
          .executeUpdate();
    }
  }

  private UUID findOrCreateTag(String name) {
    @SuppressWarnings("unchecked")
    List<UUID> existing =
        em.createNativeQuery("SELECT id FROM tags WHERE name = :name")
            .setParameter("name", name)
            .getResultList();

    if (!existing.isEmpty()) {
      return existing.get(0);
    }

    UUID newId = UUID.randomUUID();
    em.createNativeQuery("INSERT INTO tags (id, name) VALUES (:id, :name)")
        .setParameter("id", newId)
        .setParameter("name", name)
        .executeUpdate();
    return newId;
  }
}
