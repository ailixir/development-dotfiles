package com.citi.put.checks.scheduling;

import com.citi.put.checks.checks.CheckRepository;
import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.scheduling.dto.ScheduleDto;
import com.citi.put.checks.scheduling.dto.ScheduleRequest;
import com.citi.put.checks.scheduling.entity.Schedule;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.support.CronExpression;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScheduleService {

  private static final Set<String> ADMIN_ROLES = Set.of("checks-admin", "platform-admin");

  private final ScheduleRepository scheduleRepository;
  private final CheckRepository checkRepository;
  private final CsiOwnershipEvaluator ownershipEvaluator;

  public ScheduleService(
      ScheduleRepository scheduleRepository,
      CheckRepository checkRepository,
      CsiOwnershipEvaluator ownershipEvaluator) {
    this.scheduleRepository = scheduleRepository;
    this.checkRepository = checkRepository;
    this.ownershipEvaluator = ownershipEvaluator;
  }

  @Transactional
  public ScheduleDto create(ScheduleRequest request, Authentication auth) {
    Check check = requireCheckExists(request.checkId());
    requireWrite(auth, check.getCsiId());
    validateCronExpression(request.cronExpression());
    String tz = resolveTimezone(request.timezone());

    Instant nextExecution = computeNextExecution(request.cronExpression(), tz);
    boolean enabled = request.enabled() != null ? request.enabled() : true;

    Schedule schedule =
        new Schedule(
            request.checkId(),
            request.frequency(),
            request.cronExpression(),
            tz,
            enabled,
            nextExecution);

    try {
      schedule = scheduleRepository.saveAndFlush(schedule);
    } catch (DataIntegrityViolationException e) {
      throw new ScheduleConflictException(
          "A schedule already exists for check " + request.checkId());
    }

    return ScheduleDto.from(schedule);
  }

  @Transactional(readOnly = true)
  public Page<ScheduleDto> list(
      UserIdentity identity, UUID checkId, Boolean enabled, String timezone, int page, int size) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());

    Page<Schedule> result;
    if (isAdmin(identity)) {
      result = scheduleRepository.findAllFiltered(checkId, enabled, timezone, pageable);
    } else {
      List<String> ownedCsiIds =
          identity.csiOwnership().stream()
              .map(CsiOwnershipEntry::csiId)
              .collect(Collectors.toList());
      if (ownedCsiIds.isEmpty()) {
        ownedCsiIds = List.of("__none__");
      }
      result =
          scheduleRepository.findAllVisibleToFiltered(
              ownedCsiIds, checkId, enabled, timezone, pageable);
    }
    return result.map(ScheduleDto::from);
  }

  @Transactional(readOnly = true)
  public ScheduleDto findById(UUID id, Authentication auth) {
    Schedule schedule =
        scheduleRepository
            .findById(id)
            .orElseThrow(() -> new ScheduleNotFoundException("Schedule not found: " + id));
    Check check = requireCheckExists(schedule.getCheckId());
    requireRead(auth, check.getCsiId());
    return ScheduleDto.from(schedule);
  }

  @Transactional(readOnly = true)
  public ScheduleDto findByCheckId(UUID checkId) {
    return scheduleRepository.findByCheckId(checkId).map(ScheduleDto::from).orElse(null);
  }

  @Transactional
  public ScheduleDto update(UUID id, ScheduleRequest request, Authentication auth) {
    Schedule schedule =
        scheduleRepository
            .findById(id)
            .orElseThrow(() -> new ScheduleNotFoundException("Schedule not found: " + id));
    Check check = requireCheckExists(schedule.getCheckId());
    requireWrite(auth, check.getCsiId());
    validateCronExpression(request.cronExpression());
    String tz = resolveTimezone(request.timezone());

    schedule.setFrequency(request.frequency());
    schedule.setCronExpression(request.cronExpression());
    schedule.setTimezone(tz);
    if (request.enabled() != null) {
      schedule.setEnabled(request.enabled());
    }
    schedule.setNextExecutionAt(computeNextExecution(request.cronExpression(), tz));
    schedule.setUpdatedAt(Instant.now());

    return ScheduleDto.from(schedule);
  }

  @Transactional
  public ScheduleDto setEnabled(UUID id, boolean enabled, Authentication auth) {
    Schedule schedule =
        scheduleRepository
            .findById(id)
            .orElseThrow(() -> new ScheduleNotFoundException("Schedule not found: " + id));
    Check check = requireCheckExists(schedule.getCheckId());
    requireWrite(auth, check.getCsiId());

    schedule.setEnabled(enabled);
    if (enabled && schedule.getCronExpression() != null) {
      schedule.setNextExecutionAt(
          computeNextExecution(schedule.getCronExpression(), schedule.getTimezone()));
    }
    schedule.setUpdatedAt(Instant.now());

    return ScheduleDto.from(schedule);
  }

  @Transactional
  public void delete(UUID id, Authentication auth) {
    Schedule schedule =
        scheduleRepository
            .findById(id)
            .orElseThrow(() -> new ScheduleNotFoundException("Schedule not found: " + id));
    Check check = requireCheckExists(schedule.getCheckId());
    requireWrite(auth, check.getCsiId());
    scheduleRepository.delete(schedule);
  }

  private Check requireCheckExists(UUID checkId) {
    return checkRepository
        .findById(checkId)
        .orElseThrow(() -> new IllegalArgumentException("Check not found: " + checkId));
  }

  private void validateCronExpression(String cron) {
    if (cron == null || cron.isBlank()) {
      throw new ScheduleValidationException("Cron expression is required");
    }
    try {
      CronExpression.parse(cron);
    } catch (IllegalArgumentException e) {
      throw new ScheduleValidationException("Invalid cron expression: " + cron);
    }
  }

  private String resolveTimezone(String timezone) {
    String tz = timezone != null ? timezone : "UTC";
    try {
      ZoneId.of(tz);
    } catch (Exception e) {
      throw new ScheduleValidationException("Invalid timezone: " + tz);
    }
    return tz;
  }

  private Instant computeNextExecution(String cron, String timezone) {
    if (cron == null) {
      return null;
    }
    CronExpression expr = CronExpression.parse(cron);
    ZonedDateTime now = ZonedDateTime.now(ZoneId.of(timezone));
    ZonedDateTime next = expr.next(now);
    return next != null ? next.toInstant() : null;
  }

  private void requireRead(Authentication auth, String csiId) {
    if (!ownershipEvaluator.canRead(auth, csiId)) {
      throw new AccessDeniedException("No read access to CSI " + csiId);
    }
  }

  private void requireWrite(Authentication auth, String csiId) {
    if (!ownershipEvaluator.canWrite(auth, csiId)) {
      throw new AccessDeniedException("No write access to CSI " + csiId);
    }
  }

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    throw new AccessDeniedException("Not authenticated");
  }

  private boolean isAdmin(UserIdentity identity) {
    return identity.roles().stream().anyMatch(ADMIN_ROLES::contains);
  }
}
