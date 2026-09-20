package com.citi.put.checks.checks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.checks.dto.CheckRequest;
import com.citi.put.checks.checks.entity.Check;
import com.citi.put.checks.checks.model.CheckType;
import com.citi.put.checks.checks.model.HttpConfiguration;
import com.citi.put.checks.config.CheckSourceProperties;
import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.csi.entity.CsiSystem;
import com.citi.put.checks.scheduling.ScheduleRepository;
import com.citi.put.checks.scheduling.ScheduleService;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.tags.CheckTagService;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CheckServiceSourceGateTest {

  private CheckRepository checkRepository;
  private CsiRepository csiRepository;
  private CsiOwnershipEvaluator ownershipEvaluator;
  private ScheduleRepository scheduleRepository;
  private ScheduleService scheduleService;
  private CheckTagService checkTagService;

  @BeforeEach
  void setUp() {
    checkRepository = mock(CheckRepository.class);
    csiRepository = mock(CsiRepository.class);
    ownershipEvaluator = mock(CsiOwnershipEvaluator.class);
    scheduleRepository = mock(ScheduleRepository.class);
    scheduleService = mock(ScheduleService.class);
    checkTagService = mock(CheckTagService.class);
  }

  private CheckService serviceWith(Map<CheckType, Boolean> sources) {
    return new CheckService(
        checkRepository,
        csiRepository,
        ownershipEvaluator,
        scheduleRepository,
        scheduleService,
        new CheckSourceProperties(sources),
        checkTagService,
        mock(com.citi.put.checks.users.UserProvisioningService.class));
  }

  private BffAuthenticationToken fakeAuth() {
    UserIdentity identity =
        new UserIdentity(
            "user1", "user@citi.com", "Test User", "IT", List.of("checks-admin"), List.of());
    return new BffAuthenticationToken(identity);
  }

  @Test
  void createWithEnabledTypeSucceeds() {
    CheckService service = serviceWith(Map.of(CheckType.HTTP, true, CheckType.TCP, true));
    HttpConfiguration config =
        new HttpConfiguration("HTTP", "GET", "http://localhost", null, null, 200, true, 5000, true);
    CheckRequest request =
        new CheckRequest("Test", "desc", "CSI1", "Production", config, List.of());

    when(ownershipEvaluator.canWrite(any(), anyString())).thenReturn(true);
    CsiSystem csi = mock(CsiSystem.class);
    when(csi.getName()).thenReturn("Test CSI");
    when(csiRepository.findById("CSI1")).thenReturn(Optional.of(csi));
    when(checkRepository.save(any(Check.class))).thenAnswer(inv -> inv.getArgument(0));

    var result = service.create(request, fakeAuth());
    assertThat(result).isNotNull();
    verify(checkRepository).save(any());
  }

  @Test
  void createWithDisabledTypeThrows() {
    CheckService service =
        serviceWith(Map.of(CheckType.HTTP, true, CheckType.TCP, true, CheckType.SPLUNK, false));
    HttpConfiguration config =
        new HttpConfiguration(
            "SPLUNK", "GET", "http://localhost", null, null, 200, true, 5000, true);
    CheckRequest request =
        new CheckRequest("Splunk Test", "desc", "CSI1", "Production", config, List.of());

    when(ownershipEvaluator.canWrite(any(), anyString())).thenReturn(true);

    assertThatThrownBy(() -> service.create(request, fakeAuth()))
        .isInstanceOf(CheckSourceDisabledException.class)
        .hasMessageContaining("SPLUNK");

    verify(checkRepository, never()).save(any());
  }
}
