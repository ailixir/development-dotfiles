package com.citi.put.checks.reports.section;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.checks.dto.CheckDto;
import com.citi.put.checks.checks.entity.Check;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SectionResolver {

  private static final int DEFAULT_LIMIT = 100;
  private static final Map<String, Duration> TIMEFRAME_MAP =
      Map.of(
          "5m", Duration.ofMinutes(5),
          "15m", Duration.ofMinutes(15),
          "1h", Duration.ofHours(1),
          "24h", Duration.ofHours(24));

  private final CheckRepository checkRepository;
  private final ObjectMapper objectMapper;
  private final JdbcTemplate jdbcTemplate;
  private final int pageSize;

  public SectionResolver(
      CheckRepository checkRepository,
      ObjectMapper objectMapper,
      JdbcTemplate jdbcTemplate,
      @Value("${checks.reports.section-resolver-page-size:200}") int pageSize) {
    this.checkRepository = checkRepository;
    this.objectMapper = objectMapper;
    this.jdbcTemplate = jdbcTemplate;
    this.pageSize = pageSize;
  }

  public List<ReportSection> parseSections(String sectionsJson) {
    if (sectionsJson == null || sectionsJson.isBlank()) {
      return List.of();
    }
    try {
      return objectMapper.readValue(sectionsJson, new TypeReference<>() {});
    } catch (Exception e) {
      return List.of();
    }
  }

  public List<CheckDto> resolve(ReportSection section) {
    return switch (section) {
      case ManualSection manual -> resolveManual(manual);
      case RuleSection rule -> resolveRule(rule);
    };
  }

  private List<CheckDto> resolveManual(ManualSection section) {
    if (section.checkIds() == null || section.checkIds().isEmpty()) {
      return List.of();
    }
    List<UUID> uuids =
        section.checkIds().stream()
            .map(
                id -> {
                  try {
                    return UUID.fromString(id);
                  } catch (IllegalArgumentException e) {
                    return null;
                  }
                })
            .filter(id -> id != null)
            .toList();
    return checkRepository.findAllById(uuids).stream()
        .map(c -> CheckDto.from(c, List.of()))
        .toList();
  }

  private List<CheckDto> resolveRule(RuleSection section) {
    RuleSection.RuleConfig rule = section.rule();
    if (rule == null) {
      return List.of();
    }

    int limit = rule.limit() != null ? Math.min(rule.limit(), DEFAULT_LIMIT) : DEFAULT_LIMIT;

    Set<String> csiFilter = hasValues(rule.csiIds()) ? new HashSet<>(rule.csiIds()) : null;
    Set<String> typeFilter = hasValues(rule.types()) ? new HashSet<>(rule.types()) : null;
    Set<String> statusFilter = hasValues(rule.status()) ? new HashSet<>(rule.status()) : null;
    Set<UUID> tagFilter = hasValues(rule.tags()) ? resolveTaggedCheckIds(rule.tags()) : null;
    Instant sinceFilter =
        rule.timeframe() != null && TIMEFRAME_MAP.containsKey(rule.timeframe())
            ? Instant.now().minus(TIMEFRAME_MAP.get(rule.timeframe()))
            : null;

    List<Check> accumulated = new ArrayList<>();
    int page = 0;

    while (true) {
      Page<Check> batch =
          checkRepository.findAllFiltered(
              null, null, null, null, null, null, PageRequest.of(page, pageSize, Sort.by("name")));

      for (Check c : batch.getContent()) {
        if (csiFilter != null && !csiFilter.contains(c.getCsiId())) {
          continue;
        }
        if (typeFilter != null && !typeFilter.contains(c.getType())) {
          continue;
        }
        if (statusFilter != null && !statusFilter.contains(c.getStatus())) {
          continue;
        }
        if (tagFilter != null && !tagFilter.contains(c.getId())) {
          continue;
        }
        if (sinceFilter != null) {
          Instant ts = c.getLastExecutionAt() != null ? c.getLastExecutionAt() : c.getUpdatedAt();
          if (ts == null || ts.isBefore(sinceFilter)) {
            continue;
          }
        }
        accumulated.add(c);
      }

      page++;
      if (!batch.hasNext()) {
        break;
      }
    }

    accumulated.sort(resolveCheckComparator(rule.sort()));
    return accumulated.stream().limit(limit).map(c -> CheckDto.from(c, List.of())).toList();
  }

  private Set<UUID> resolveTaggedCheckIds(List<String> tagNames) {
    String placeholders = tagNames.stream().map(t -> "?").collect(Collectors.joining(","));
    String sql =
        "SELECT DISTINCT ct.check_id FROM check_tags ct"
            + " JOIN tags t ON t.id = ct.tag_id"
            + " WHERE t.name IN ("
            + placeholders
            + ")";
    List<UUID> ids = jdbcTemplate.queryForList(sql, UUID.class, tagNames.toArray());
    return new HashSet<>(ids);
  }

  private Comparator<Check> resolveCheckComparator(String sort) {
    if ("failing-first".equals(sort)) {
      Map<String, Integer> priority =
          Map.of("FAILING", 0, "WARNING", 1, "PENDING", 2, "UNKNOWN", 3, "PASSING", 4);
      return Comparator.<Check, Integer>comparing(c -> priority.getOrDefault(c.getStatus(), 5))
          .thenComparing(Check::getName, Comparator.nullsLast(Comparator.naturalOrder()));
    }
    if ("recently-failed".equals(sort)) {
      return Comparator.comparing(
          (Check c) -> c.getLastExecutionAt() != null ? c.getLastExecutionAt() : c.getUpdatedAt(),
          Comparator.nullsLast(Comparator.reverseOrder()));
    }
    return Comparator.comparing(Check::getName, Comparator.nullsLast(Comparator.naturalOrder()));
  }

  private boolean hasValues(List<String> list) {
    return list != null && !list.isEmpty();
  }
}
