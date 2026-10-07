package com.citi.put.checks.studio;

import com.citi.put.checks.studio.dto.ExecutionStatus;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

/**
 * The validated search, filter and sort of the two Studio list routes (Story 10.46).
 *
 * <p>Every value arrives as an untyped query parameter and is checked here, once, before any query
 * is built: an unknown {@code sort}, {@code status} or {@code lastRun} is a {@code 400
 * INVALID_QUERY} through {@link StudioValidationException}, never a silently ignored filter. Blank
 * strings mean "not supplied", so a client that serializes empty URL state does not filter on an
 * empty value.
 *
 * <p>Nothing here widens access. The CSI scope is applied by the repository on top of these
 * filters, and {@code csiId} can only narrow it.
 */
public final class StudioListQuery {

  /** The {@code error} code of every rejected list parameter. */
  public static final String INVALID_QUERY = "INVALID_QUERY";

  /** {@code lastRun} value selecting drafts that have never finished a run. */
  public static final String NEVER = "NEVER";

  /**
   * {@code status} value selecting {@code ERROR} executions whose {@code errorCode} is {@code
   * CANCELLED} — the same rule as the MFE's {@code isCancelledOutcome}.
   */
  public static final String CANCELLED = "CANCELLED";

  private static final Set<String> LAST_RUN_VALUES =
      Set.of(ExecutionStatus.PASSED, ExecutionStatus.FAILED, ExecutionStatus.ERROR, NEVER);

  private static final Set<String> EXECUTION_STATUS_VALUES =
      Set.of(
          ExecutionStatus.PENDING,
          ExecutionStatus.RUNNING,
          ExecutionStatus.PASSED,
          ExecutionStatus.FAILED,
          ExecutionStatus.ERROR,
          CANCELLED);

  private StudioListQuery() {}

  /** Sortable fields of {@code GET /tests}, by their public names. */
  public enum TestSort {
    NAME("name"),
    UPDATED_AT("updatedAt"),
    LAST_RUN_AT("lastRunAt");

    private final String publicName;

    TestSort(String publicName) {
      this.publicName = publicName;
    }

    static TestSort of(String name) {
      for (TestSort candidate : values()) {
        if (candidate.publicName.equals(name)) {
          return candidate;
        }
      }
      throw invalid("sort", name, "name, updatedAt, lastRunAt");
    }
  }

  /** Sortable fields of {@code GET /executions}, by their public names. */
  public enum ExecutionSort {
    ACCEPTED_AT("acceptedAt"),
    DURATION_MS("durationMs");

    private final String publicName;

    ExecutionSort(String publicName) {
      this.publicName = publicName;
    }

    static ExecutionSort of(String name) {
      for (ExecutionSort candidate : values()) {
        if (candidate.publicName.equals(name)) {
          return candidate;
        }
      }
      throw invalid("sort", name, "acceptedAt, durationMs");
    }
  }

  /**
   * {@code GET /tests} parameters.
   *
   * @param csiId exact CSI, or null
   * @param environment exact environment, or null
   * @param search trimmed, case-insensitive substring of name or description, or null
   * @param lastRun {@code PASSED | FAILED | ERROR | NEVER}, or null
   * @param sort the primary order; the draft id always follows as the tie-breaker
   * @param ascending direction of the primary order and of the tie-breaker
   */
  public record Tests(
      String csiId,
      String environment,
      String search,
      String lastRun,
      TestSort sort,
      boolean ascending) {

    /** Validates and normalizes raw request parameters. */
    public static Tests parse(
        String csiId, String environment, String q, String lastRun, String sort) {
      String normalizedLastRun = upper(blankToNull(lastRun));
      if (normalizedLastRun != null && !LAST_RUN_VALUES.contains(normalizedLastRun)) {
        throw invalid("lastRun", lastRun, "PASSED, FAILED, ERROR, NEVER");
      }
      String[] order = splitSort(sort);
      TestSort field = order == null ? TestSort.UPDATED_AT : TestSort.of(order[0]);
      boolean ascending = order != null && isAscending(order[1], sort);
      return new Tests(
          blankToNull(csiId),
          blankToNull(environment),
          blankToNull(q),
          normalizedLastRun,
          field,
          ascending);
    }
  }

  /**
   * {@code GET /executions} parameters.
   *
   * @param testId exact test, or null
   * @param csiId exact execution CSI, or null; intersected with the caller's scope
   * @param status {@code PENDING | RUNNING | PASSED | FAILED | ERROR | CANCELLED}, or null
   * @param search trimmed, case-insensitive substring of the test name, or null
   * @param sort the primary order; the execution id always follows as the tie-breaker
   * @param ascending direction of the primary order and of the tie-breaker
   */
  public record Executions(
      UUID testId,
      String csiId,
      String status,
      String search,
      ExecutionSort sort,
      boolean ascending) {

    /** Validates and normalizes raw request parameters. */
    public static Executions parse(
        UUID testId, String csiId, String status, String q, String sort) {
      String normalizedStatus = upper(blankToNull(status));
      if (normalizedStatus != null && !EXECUTION_STATUS_VALUES.contains(normalizedStatus)) {
        throw invalid("status", status, "PENDING, RUNNING, PASSED, FAILED, ERROR, CANCELLED");
      }
      String[] order = splitSort(sort);
      ExecutionSort field = order == null ? ExecutionSort.ACCEPTED_AT : ExecutionSort.of(order[0]);
      boolean ascending = order != null && isAscending(order[1], sort);
      return new Executions(
          testId, blankToNull(csiId), normalizedStatus, blankToNull(q), field, ascending);
    }
  }

  /**
   * Splits {@code field[,direction]}. A missing direction is ascending, as in Spring Data's own
   * {@code sort} convention.
   *
   * @return {@code [field, direction]}, or null when no sort was supplied
   */
  private static String[] splitSort(String sort) {
    String value = blankToNull(sort);
    if (value == null) {
      return null;
    }
    String[] parts = value.split(",", -1);
    if (parts.length > 2) {
      throw invalid("sort", sort, "<field>,asc|desc");
    }
    return new String[] {parts[0].trim(), parts.length == 2 ? parts[1].trim() : "asc"};
  }

  private static boolean isAscending(String direction, String raw) {
    return switch (direction.toLowerCase(Locale.ROOT)) {
      case "asc" -> true;
      case "desc" -> false;
      default -> throw invalid("sort", raw, "<field>,asc|desc");
    };
  }

  private static String blankToNull(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private static String upper(String value) {
    return value == null ? null : value.toUpperCase(Locale.ROOT);
  }

  private static StudioValidationException invalid(String parameter, String value, String allowed) {
    return new StudioValidationException(
        INVALID_QUERY,
        "Unsupported " + parameter + " '" + value + "'; expected one of: " + allowed);
  }

  /**
   * A case-insensitive {@code LIKE} pattern matching {@code search} anywhere, with the wildcard
   * characters of the input itself escaped by {@code !}. Used with {@code ESCAPE '!'}.
   */
  static String containsPattern(String search) {
    String escaped =
        search.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_");
    return "%" + escaped + "%";
  }
}
