<#
.SYNOPSIS
    Auto-generated STANDALONE deployment script for 178672.put.put-checks

.DESCRIPTION
    This script recreates the complete project structure and files.
    ALL FILE CONTENTS ARE EMBEDDED WITHIN THIS SCRIPT.
    No external dependencies required.

    Generated on: 2026-05-23T00:13:13.291Z
    Source: /Users/brunobuger/workspace/citi/put/put-checks
    Total Files: 341

.NOTES
    Run this script in an empty directory where you want the project created.
    Requires PowerShell 5.0 or higher.
    This is a completely self-contained script with all file contents embedded.
#>

$ErrorActionPreference = 'Stop'

# === CONFIGURATION ===
$ProjectName = '178672.put.put-checks'
$ExpectedTotalFiles = 341
$ExpectedTotalDirectories = 99
$IsWindowsHost = $false
$isWindowsVariable = Get-Variable -Name IsWindows -ErrorAction SilentlyContinue
if ($isWindowsVariable) {
  $IsWindowsHost = [bool]$isWindowsVariable.Value
} else {
  $IsWindowsHost = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT
}

# Auto-elevate if on Windows and not running as admin
try {
  if ($IsWindowsHost) {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
      Write-Host '[i] Not running as Administrator. Attempting to relaunch with elevation...' -ForegroundColor Yellow
      $psi = New-Object System.Diagnostics.ProcessStartInfo 'powershell'
      $psi.Arguments = '-ExecutionPolicy Bypass -File "' + $MyInvocation.MyCommand.Definition + '"'
      $psi.Verb = 'runas'
      [Diagnostics.Process]::Start($psi) | Out-Null
      exit
    }
  }
} catch {
  Write-Host '[w] Elevation step skipped or failed: ' + $_.Exception.Message -ForegroundColor Yellow
}

# Set execution policy for this process only
try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force } catch {}

# === INVENTORY (as comments) ===
<#
Directories (99):
  - backend
  - backend/buildSrc
  - backend/buildSrc/src
  - backend/buildSrc/src/main
  - backend/buildSrc/src/main/kotlin
  - backend/buildSrc/src/main/kotlin/rules
  - backend/buildSrc/src/test
  - backend/buildSrc/src/test/kotlin
  - backend/config
  - backend/config/checkstyle
  - backend/config/rds-parity
  - backend/config/spotbugs
  - backend/gradle
  - backend/gradle/wrapper
  - backend/src
  - backend/src/main
  - backend/src/main/java
  - backend/src/main/java/com
  - backend/src/main/java/com/citi
  - backend/src/main/java/com/citi/put
  - backend/src/main/java/com/citi/put/checks
  - backend/src/main/java/com/citi/put/checks/checks
  - backend/src/main/java/com/citi/put/checks/checks/bulk
  - backend/src/main/java/com/citi/put/checks/checks/dto
  - backend/src/main/java/com/citi/put/checks/checks/entity
  - backend/src/main/java/com/citi/put/checks/checks/execution
  - backend/src/main/java/com/citi/put/checks/checks/execution/dto
  - backend/src/main/java/com/citi/put/checks/checks/execution/entity
  - backend/src/main/java/com/citi/put/checks/checks/executors
  - backend/src/main/java/com/citi/put/checks/checks/model
  - backend/src/main/java/com/citi/put/checks/config
  - backend/src/main/java/com/citi/put/checks/config/logging
  - backend/src/main/java/com/citi/put/checks/csi
  - backend/src/main/java/com/citi/put/checks/csi/dto
  - backend/src/main/java/com/citi/put/checks/csi/entity
  - backend/src/main/java/com/citi/put/checks/dashboard
  - backend/src/main/java/com/citi/put/checks/dashboard/dto
  - backend/src/main/java/com/citi/put/checks/reports
  - backend/src/main/java/com/citi/put/checks/reports/dto
  - backend/src/main/java/com/citi/put/checks/reports/entity
  - backend/src/main/java/com/citi/put/checks/reports/mail
  - backend/src/main/java/com/citi/put/checks/reports/render
  - backend/src/main/java/com/citi/put/checks/reports/schedule
  - backend/src/main/java/com/citi/put/checks/reports/section
  - backend/src/main/java/com/citi/put/checks/scheduling
  - backend/src/main/java/com/citi/put/checks/scheduling/dto
  - backend/src/main/java/com/citi/put/checks/scheduling/entity
  - backend/src/main/java/com/citi/put/checks/scheduling/partitioning
  - backend/src/main/java/com/citi/put/checks/secrets
  - backend/src/main/java/com/citi/put/checks/secrets/dto
  - backend/src/main/java/com/citi/put/checks/secrets/entity
  - backend/src/main/java/com/citi/put/checks/security
  - backend/src/main/java/com/citi/put/checks/security/event
  - backend/src/main/java/com/citi/put/checks/studio
  - backend/src/main/java/com/citi/put/checks/studio/dto
  - backend/src/main/java/com/citi/put/checks/studio/entity
  - backend/src/main/java/com/citi/put/checks/studio/validation
  - backend/src/main/java/com/citi/put/checks/tags
  - backend/src/main/java/com/citi/put/checks/tags/dto
  - backend/src/main/java/com/citi/put/checks/templates
  - backend/src/main/java/com/citi/put/checks/templates/dto
  - backend/src/main/java/com/citi/put/checks/templates/entity
  - backend/src/main/java/com/citi/put/checks/users
  - backend/src/main/java/com/citi/put/checks/users/dto
  - backend/src/main/java/com/citi/put/checks/users/entity
  - backend/src/main/resources
  - backend/src/main/resources/db
  - backend/src/main/resources/db/migration
  - backend/src/main/resources/db/seed
  - backend/src/test
  - backend/src/test/java
  - backend/src/test/java/com
  - backend/src/test/java/com/citi
  - backend/src/test/java/com/citi/put
  - backend/src/test/java/com/citi/put/checks
  - backend/src/test/java/com/citi/put/checks/checks
  - backend/src/test/java/com/citi/put/checks/checks/bulk
  - backend/src/test/java/com/citi/put/checks/checks/execution
  - backend/src/test/java/com/citi/put/checks/checks/executors
  - backend/src/test/java/com/citi/put/checks/config
  - backend/src/test/java/com/citi/put/checks/config/logging
  - backend/src/test/java/com/citi/put/checks/csi
  - backend/src/test/java/com/citi/put/checks/dashboard
  - backend/src/test/java/com/citi/put/checks/profile
  - backend/src/test/java/com/citi/put/checks/reports
  - backend/src/test/java/com/citi/put/checks/reports/mail
  - backend/src/test/java/com/citi/put/checks/reports/schedule
  - backend/src/test/java/com/citi/put/checks/resilience
  - backend/src/test/java/com/citi/put/checks/scheduling
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning
  - backend/src/test/java/com/citi/put/checks/security
  - backend/src/test/java/com/citi/put/checks/smoke
  - backend/src/test/java/com/citi/put/checks/smoke/entity
  - backend/src/test/java/com/citi/put/checks/users
  - backend/src/test/resources
  - backend/src/test/resources/contracts
  - backend/src/test/resources/rds-parity-fixtures
  - backend/src/test/resources/rds-parity-fixtures/bad
  - backend/src/test/resources/rds-parity-fixtures/ok

Files (341):
  - backend/.gitignore
  - backend/build.gradle.kts
  - backend/buildSrc/build.gradle.kts
  - backend/buildSrc/settings.gradle.kts
  - backend/buildSrc/src/main/kotlin/AllowlistLoader.kt
  - backend/buildSrc/src/main/kotlin/CommentStripper.kt
  - backend/buildSrc/src/main/kotlin/LintRule.kt
  - backend/buildSrc/src/main/kotlin/RdsParityLintTask.kt
  - backend/buildSrc/src/main/kotlin/rules/AlterSystemRule.kt
  - backend/buildSrc/src/main/kotlin/rules/CopyFromProgramRule.kt
  - backend/buildSrc/src/main/kotlin/rules/DropExtensionRule.kt
  - backend/buildSrc/src/main/kotlin/rules/ExtensionAllowlistRule.kt
  - backend/buildSrc/src/main/kotlin/rules/LanguageCFunctionRule.kt
  - backend/buildSrc/src/main/kotlin/rules/ServerFileRolesRule.kt
  - backend/buildSrc/src/main/kotlin/rules/SuperuserRule.kt
  - backend/buildSrc/src/test/kotlin/CommentStripperTest.kt
  - backend/buildSrc/src/test/kotlin/RdsParityLintUnitTest.kt
  - backend/config/checkstyle/checkstyle.xml
  - backend/config/rds-parity/allowlist.yml
  - backend/config/rds-parity/README.md
  - backend/config/spotbugs/exclude.xml
  - backend/gradle.properties
  - backend/gradle/wrapper/gradle-wrapper.jar
  - backend/gradle/wrapper/gradle-wrapper.properties
  - backend/gradlew
  - backend/gradlew.bat
  - backend/README.md
  - backend/settings.gradle.kts
  - backend/src/main/java/com/citi/put/checks/checks/bulk/BulkController.java
  - backend/src/main/java/com/citi/put/checks/checks/bulk/BulkOperation.java
  - backend/src/main/java/com/citi/put/checks/checks/bulk/BulkRequestDto.java
  - backend/src/main/java/com/citi/put/checks/checks/bulk/BulkResponseDto.java
  - backend/src/main/java/com/citi/put/checks/checks/bulk/BulkService.java
  - backend/src/main/java/com/citi/put/checks/checks/CheckController.java
  - backend/src/main/java/com/citi/put/checks/checks/CheckRepository.java
  - backend/src/main/java/com/citi/put/checks/checks/CheckService.java
  - backend/src/main/java/com/citi/put/checks/checks/CheckSourceDisabledException.java
  - backend/src/main/java/com/citi/put/checks/checks/CheckSourcesController.java
  - backend/src/main/java/com/citi/put/checks/checks/dto/CheckDto.java
  - backend/src/main/java/com/citi/put/checks/checks/dto/CheckRequest.java
  - backend/src/main/java/com/citi/put/checks/checks/dto/CheckSourceDto.java
  - backend/src/main/java/com/citi/put/checks/checks/dto/CheckSourcesResponse.java
  - backend/src/main/java/com/citi/put/checks/checks/dto/FeatureFlagDto.java
  - backend/src/main/java/com/citi/put/checks/checks/dto/FeaturesResponse.java
  - backend/src/main/java/com/citi/put/checks/checks/dto/UpcomingCheckDto.java
  - backend/src/main/java/com/citi/put/checks/checks/entity/Check.java
  - backend/src/main/java/com/citi/put/checks/checks/execution/CheckExecuteController.java
  - backend/src/main/java/com/citi/put/checks/checks/execution/dto/ExecutionResultDto.java
  - backend/src/main/java/com/citi/put/checks/checks/execution/entity/ExecutionResult.java
  - backend/src/main/java/com/citi/put/checks/checks/execution/entity/ExecutionResultId.java
  - backend/src/main/java/com/citi/put/checks/checks/execution/ExecutionHistoryController.java
  - backend/src/main/java/com/citi/put/checks/checks/execution/ExecutionPersistenceService.java
  - backend/src/main/java/com/citi/put/checks/checks/execution/ExecutionResultRepository.java
  - backend/src/main/java/com/citi/put/checks/checks/execution/TestConnectionController.java
  - backend/src/main/java/com/citi/put/checks/checks/executors/CheckExecutor.java
  - backend/src/main/java/com/citi/put/checks/checks/executors/CheckExecutorDispatcher.java
  - backend/src/main/java/com/citi/put/checks/checks/executors/CheckSourceDisabledException.java
  - backend/src/main/java/com/citi/put/checks/checks/executors/ExecutionContext.java
  - backend/src/main/java/com/citi/put/checks/checks/executors/ExecutionOutcome.java
  - backend/src/main/java/com/citi/put/checks/checks/executors/HttpCheckExecutor.java
  - backend/src/main/java/com/citi/put/checks/checks/executors/TcpCheckExecutor.java
  - backend/src/main/java/com/citi/put/checks/checks/executors/UnsupportedCheckTypeException.java
  - backend/src/main/java/com/citi/put/checks/checks/FeaturesController.java
  - backend/src/main/java/com/citi/put/checks/checks/model/CheckConfiguration.java
  - backend/src/main/java/com/citi/put/checks/checks/model/CheckType.java
  - backend/src/main/java/com/citi/put/checks/checks/model/HttpConfiguration.java
  - backend/src/main/java/com/citi/put/checks/checks/model/TcpConfiguration.java
  - backend/src/main/java/com/citi/put/checks/ChecksApplication.java
  - backend/src/main/java/com/citi/put/checks/config/AppPropertiesConfig.java
  - backend/src/main/java/com/citi/put/checks/config/AsyncConfig.java
  - backend/src/main/java/com/citi/put/checks/config/BucketStore.java
  - backend/src/main/java/com/citi/put/checks/config/CachedResponse.java
  - backend/src/main/java/com/citi/put/checks/config/ChecksExceptionHandler.java
  - backend/src/main/java/com/citi/put/checks/config/CheckSourceMetrics.java
  - backend/src/main/java/com/citi/put/checks/config/CheckSourceProperties.java
  - backend/src/main/java/com/citi/put/checks/config/CoreServiceProperties.java
  - backend/src/main/java/com/citi/put/checks/config/CorsProperties.java
  - backend/src/main/java/com/citi/put/checks/config/FeatureFlag.java
  - backend/src/main/java/com/citi/put/checks/config/FeatureFlagProperties.java
  - backend/src/main/java/com/citi/put/checks/config/IdempotencyFilter.java
  - backend/src/main/java/com/citi/put/checks/config/LocalDevAuthFilter.java
  - backend/src/main/java/com/citi/put/checks/config/LocalEmbeddedPostgresConfig.java
  - backend/src/main/java/com/citi/put/checks/config/logging/MaskingMessageJsonProvider.java
  - backend/src/main/java/com/citi/put/checks/config/logging/SecretMasker.java
  - backend/src/main/java/com/citi/put/checks/config/MdcTaskDecorator.java
  - backend/src/main/java/com/citi/put/checks/config/OpenApiConfig.java
  - backend/src/main/java/com/citi/put/checks/config/RateLimitClassifier.java
  - backend/src/main/java/com/citi/put/checks/config/RateLimitFilter.java
  - backend/src/main/java/com/citi/put/checks/config/RateLimitProperties.java
  - backend/src/main/java/com/citi/put/checks/config/SecurityConfig.java
  - backend/src/main/java/com/citi/put/checks/config/SemaphoreBoundedExecutor.java
  - backend/src/main/java/com/citi/put/checks/config/ShedLockConfig.java
  - backend/src/main/java/com/citi/put/checks/config/SourceConcurrencyProperties.java
  - backend/src/main/java/com/citi/put/checks/config/WorkerSecurityConfig.java
  - backend/src/main/java/com/citi/put/checks/csi/CsiApiClient.java
  - backend/src/main/java/com/citi/put/checks/csi/CsiApiProperties.java
  - backend/src/main/java/com/citi/put/checks/csi/CsiController.java
  - backend/src/main/java/com/citi/put/checks/csi/CsiRepository.java
  - backend/src/main/java/com/citi/put/checks/csi/CsiService.java
  - backend/src/main/java/com/citi/put/checks/csi/dto/CsiDto.java
  - backend/src/main/java/com/citi/put/checks/csi/dto/CsiHealthSummary.java
  - backend/src/main/java/com/citi/put/checks/csi/dto/CsiSearchResult.java
  - backend/src/main/java/com/citi/put/checks/csi/entity/CsiSystem.java
  - backend/src/main/java/com/citi/put/checks/csi/JpaCsiApiClient.java
  - backend/src/main/java/com/citi/put/checks/csi/RemoteCsiApiClient.java
  - backend/src/main/java/com/citi/put/checks/dashboard/DashboardController.java
  - backend/src/main/java/com/citi/put/checks/dashboard/DashboardService.java
  - backend/src/main/java/com/citi/put/checks/dashboard/dto/ActivityItemDto.java
  - backend/src/main/java/com/citi/put/checks/dashboard/dto/AttentionItemDto.java
  - backend/src/main/java/com/citi/put/checks/dashboard/dto/DashboardSummaryDto.java
  - backend/src/main/java/com/citi/put/checks/dashboard/dto/ReportSnapshotDto.java
  - backend/src/main/java/com/citi/put/checks/dashboard/dto/SearchResultDto.java
  - backend/src/main/java/com/citi/put/checks/dashboard/dto/UpcomingItemDto.java
  - backend/src/main/java/com/citi/put/checks/reports/dto/ReportDto.java
  - backend/src/main/java/com/citi/put/checks/reports/dto/ReportExecutionDto.java
  - backend/src/main/java/com/citi/put/checks/reports/dto/ReportRequest.java
  - backend/src/main/java/com/citi/put/checks/reports/entity/Report.java
  - backend/src/main/java/com/citi/put/checks/reports/entity/ReportExecution.java
  - backend/src/main/java/com/citi/put/checks/reports/mail/ReportMailSender.java
  - backend/src/main/java/com/citi/put/checks/reports/mail/SendResult.java
  - backend/src/main/java/com/citi/put/checks/reports/render/ReportRenderer.java
  - backend/src/main/java/com/citi/put/checks/reports/render/ResolvedSection.java
  - backend/src/main/java/com/citi/put/checks/reports/ReportDeliveryService.java
  - backend/src/main/java/com/citi/put/checks/reports/ReportExecutionRepository.java
  - backend/src/main/java/com/citi/put/checks/reports/ReportNotFoundException.java
  - backend/src/main/java/com/citi/put/checks/reports/ReportsController.java
  - backend/src/main/java/com/citi/put/checks/reports/ReportsRepository.java
  - backend/src/main/java/com/citi/put/checks/reports/ReportsService.java
  - backend/src/main/java/com/citi/put/checks/reports/schedule/ReportScheduleResolver.java
  - backend/src/main/java/com/citi/put/checks/reports/section/ManualSection.java
  - backend/src/main/java/com/citi/put/checks/reports/section/ReportSection.java
  - backend/src/main/java/com/citi/put/checks/reports/section/RuleSection.java
  - backend/src/main/java/com/citi/put/checks/reports/section/SectionResolver.java
  - backend/src/main/java/com/citi/put/checks/scheduling/CronDispatcher.java
  - backend/src/main/java/com/citi/put/checks/scheduling/CsiMetricsRefreshScheduler.java
  - backend/src/main/java/com/citi/put/checks/scheduling/DispatcherHealthIndicator.java
  - backend/src/main/java/com/citi/put/checks/scheduling/dto/EnableRequest.java
  - backend/src/main/java/com/citi/put/checks/scheduling/dto/ScheduleDto.java
  - backend/src/main/java/com/citi/put/checks/scheduling/dto/ScheduleRequest.java
  - backend/src/main/java/com/citi/put/checks/scheduling/entity/FailedDispatch.java
  - backend/src/main/java/com/citi/put/checks/scheduling/entity/Schedule.java
  - backend/src/main/java/com/citi/put/checks/scheduling/FailedDispatchRepository.java
  - backend/src/main/java/com/citi/put/checks/scheduling/partitioning/PartitionHealthIndicator.java
  - backend/src/main/java/com/citi/put/checks/scheduling/partitioning/PartitionManager.java
  - backend/src/main/java/com/citi/put/checks/scheduling/partitioning/PartitionScheduler.java
  - backend/src/main/java/com/citi/put/checks/scheduling/partitioning/RetentionPruner.java
  - backend/src/main/java/com/citi/put/checks/scheduling/ReportDeliveryDispatcher.java
  - backend/src/main/java/com/citi/put/checks/scheduling/RetryDispatcher.java
  - backend/src/main/java/com/citi/put/checks/scheduling/ScheduleConflictException.java
  - backend/src/main/java/com/citi/put/checks/scheduling/ScheduleController.java
  - backend/src/main/java/com/citi/put/checks/scheduling/ScheduleNotFoundException.java
  - backend/src/main/java/com/citi/put/checks/scheduling/ScheduleRepository.java
  - backend/src/main/java/com/citi/put/checks/scheduling/ScheduleService.java
  - backend/src/main/java/com/citi/put/checks/scheduling/ScheduleValidationException.java
  - backend/src/main/java/com/citi/put/checks/secrets/dto/CreateSecretRequest.java
  - backend/src/main/java/com/citi/put/checks/secrets/dto/SecretDto.java
  - backend/src/main/java/com/citi/put/checks/secrets/entity/Secret.java
  - backend/src/main/java/com/citi/put/checks/secrets/SecretsController.java
  - backend/src/main/java/com/citi/put/checks/secrets/SecretsRepository.java
  - backend/src/main/java/com/citi/put/checks/secrets/SecretsService.java
  - backend/src/main/java/com/citi/put/checks/security/BffAuthenticationToken.java
  - backend/src/main/java/com/citi/put/checks/security/BffSessionAuthenticationFilter.java
  - backend/src/main/java/com/citi/put/checks/security/CoreServiceClient.java
  - backend/src/main/java/com/citi/put/checks/security/CoreServiceUnauthorizedException.java
  - backend/src/main/java/com/citi/put/checks/security/CoreServiceUnavailableException.java
  - backend/src/main/java/com/citi/put/checks/security/CsiOwnershipEntry.java
  - backend/src/main/java/com/citi/put/checks/security/CsiOwnershipEvaluator.java
  - backend/src/main/java/com/citi/put/checks/security/event/UserAuthenticatedEvent.java
  - backend/src/main/java/com/citi/put/checks/security/PermissionAspect.java
  - backend/src/main/java/com/citi/put/checks/security/RequiresPermission.java
  - backend/src/main/java/com/citi/put/checks/security/UserIdentity.java
  - backend/src/main/java/com/citi/put/checks/studio/dto/UITestDto.java
  - backend/src/main/java/com/citi/put/checks/studio/dto/UITestExecutionDto.java
  - backend/src/main/java/com/citi/put/checks/studio/dto/UITestRequest.java
  - backend/src/main/java/com/citi/put/checks/studio/entity/UITest.java
  - backend/src/main/java/com/citi/put/checks/studio/entity/UITestExecution.java
  - backend/src/main/java/com/citi/put/checks/studio/StudioController.java
  - backend/src/main/java/com/citi/put/checks/studio/StudioRepository.java
  - backend/src/main/java/com/citi/put/checks/studio/StudioService.java
  - backend/src/main/java/com/citi/put/checks/studio/UITestExecutionRepository.java
  - backend/src/main/java/com/citi/put/checks/studio/validation/StepValidator.java
  - backend/src/main/java/com/citi/put/checks/tags/CheckTagService.java
  - backend/src/main/java/com/citi/put/checks/tags/dto/TagStatsDto.java
  - backend/src/main/java/com/citi/put/checks/tags/dto/TagSuggestionsRequest.java
  - backend/src/main/java/com/citi/put/checks/tags/TagsController.java
  - backend/src/main/java/com/citi/put/checks/tags/TagsService.java
  - backend/src/main/java/com/citi/put/checks/templates/dto/CheckTemplateDto.java
  - backend/src/main/java/com/citi/put/checks/templates/entity/CheckTemplate.java
  - backend/src/main/java/com/citi/put/checks/templates/TemplatesController.java
  - backend/src/main/java/com/citi/put/checks/templates/TemplatesRepository.java
  - backend/src/main/java/com/citi/put/checks/templates/TemplatesService.java
  - backend/src/main/java/com/citi/put/checks/users/dto/UserDto.java
  - backend/src/main/java/com/citi/put/checks/users/entity/User.java
  - backend/src/main/java/com/citi/put/checks/users/RateLimitedProvisioningWrapper.java
  - backend/src/main/java/com/citi/put/checks/users/UserProvisioningService.java
  - backend/src/main/java/com/citi/put/checks/users/UserRepository.java
  - backend/src/main/java/com/citi/put/checks/users/UsersController.java
  - backend/src/main/resources/application-api.yml
  - backend/src/main/resources/application-dev.yml
  - backend/src/main/resources/application-local.yml
  - backend/src/main/resources/application-prod.yml
  - backend/src/main/resources/application-staging.yml
  - backend/src/main/resources/application-test.yml
  - backend/src/main/resources/application-worker.yml
  - backend/src/main/resources/application.yml
  - backend/src/main/resources/db/migration/V1__init.sql
  - backend/src/main/resources/db/migration/V10__uppercase_status_standardization.sql
  - backend/src/main/resources/db/migration/V11__check_acknowledge_assign.sql
  - backend/src/main/resources/db/migration/V2__schedule_next_execution.sql
  - backend/src/main/resources/db/migration/V3__check_templates_seed.sql
  - backend/src/main/resources/db/migration/V4__secrets_encrypted_value.sql
  - backend/src/main/resources/db/migration/V5__story_3_schema_additions.sql
  - backend/src/main/resources/db/migration/V6__report_next_delivery.sql
  - backend/src/main/resources/db/migration/V7__partition_remaining_tables_and_defaults.sql
  - backend/src/main/resources/db/migration/V8__failed_dispatches_and_report_failures.sql
  - backend/src/main/resources/db/migration/V9__schedules_check_type_column.sql
  - backend/src/main/resources/db/seed/R__sample_data.sql
  - backend/src/main/resources/logback-spring.xml
  - backend/src/test/java/com/citi/put/checks/checks/bulk/BulkDeleteIT.java
  - backend/src/test/java/com/citi/put/checks/checks/CheckCrudIT.java
  - backend/src/test/java/com/citi/put/checks/checks/CheckRequestDeserializationTest.java
  - backend/src/test/java/com/citi/put/checks/checks/CheckServiceSourceGateTest.java
  - backend/src/test/java/com/citi/put/checks/checks/ConfigurationRoundtripIT.java
  - backend/src/test/java/com/citi/put/checks/checks/execution/PersistenceIT.java
  - backend/src/test/java/com/citi/put/checks/checks/executors/DispatcherSourceGateTest.java
  - backend/src/test/java/com/citi/put/checks/checks/executors/HttpExecutorIT.java
  - backend/src/test/java/com/citi/put/checks/checks/executors/SourceConcurrencyCapIT.java
  - backend/src/test/java/com/citi/put/checks/checks/executors/TcpCheckExecutorIT.java
  - backend/src/test/java/com/citi/put/checks/checks/ExhaustivenessTest.java
  - backend/src/test/java/com/citi/put/checks/ChecksApplicationTest.java
  - backend/src/test/java/com/citi/put/checks/config/AppExecutorBoundIT.java
  - backend/src/test/java/com/citi/put/checks/config/CheckSourcePropertiesTest.java
  - backend/src/test/java/com/citi/put/checks/config/ExecutorConcurrencyIT.java
  - backend/src/test/java/com/citi/put/checks/config/FeatureFlagPropertiesTest.java
  - backend/src/test/java/com/citi/put/checks/config/IdempotencyFilterIT.java
  - backend/src/test/java/com/citi/put/checks/config/IdempotencyInFlightConflictIT.java
  - backend/src/test/java/com/citi/put/checks/config/logging/SecretMaskerTest.java
  - backend/src/test/java/com/citi/put/checks/config/MdcPropagationIT.java
  - backend/src/test/java/com/citi/put/checks/config/OpenApiReachableIT.java
  - backend/src/test/java/com/citi/put/checks/config/PlatformThreadIT.java
  - backend/src/test/java/com/citi/put/checks/config/RateLimitFilterIT.java
  - backend/src/test/java/com/citi/put/checks/config/SecurityContextPropagationIT.java
  - backend/src/test/java/com/citi/put/checks/config/SemaphoreBoundIT.java
  - backend/src/test/java/com/citi/put/checks/config/SourceConcurrencyConfigValidationTest.java
  - backend/src/test/java/com/citi/put/checks/config/VirtualThreadIT.java
  - backend/src/test/java/com/citi/put/checks/csi/CsiChecksEndpointIT.java
  - backend/src/test/java/com/citi/put/checks/csi/CsiFetchIT.java
  - backend/src/test/java/com/citi/put/checks/csi/CsiListIT.java
  - backend/src/test/java/com/citi/put/checks/dashboard/DashboardSoftDeleteIT.java
  - backend/src/test/java/com/citi/put/checks/LogMaskingIT.java
  - backend/src/test/java/com/citi/put/checks/profile/ApiProfileIT.java
  - backend/src/test/java/com/citi/put/checks/profile/DefaultProfileIT.java
  - backend/src/test/java/com/citi/put/checks/profile/WorkerProfileIT.java
  - backend/src/test/java/com/citi/put/checks/reports/mail/ReportMailSenderTest.java
  - backend/src/test/java/com/citi/put/checks/reports/ReportDeliveryBatchIT.java
  - backend/src/test/java/com/citi/put/checks/reports/ReportDeliveryDispatcherIT.java
  - backend/src/test/java/com/citi/put/checks/reports/ReportRendererTest.java
  - backend/src/test/java/com/citi/put/checks/reports/ReportsCrudIT.java
  - backend/src/test/java/com/citi/put/checks/reports/ReportsDuplicateIT.java
  - backend/src/test/java/com/citi/put/checks/reports/ReportsExecutionIT.java
  - backend/src/test/java/com/citi/put/checks/reports/ReportsPreviewIT.java
  - backend/src/test/java/com/citi/put/checks/reports/schedule/ReportScheduleResolverTest.java
  - backend/src/test/java/com/citi/put/checks/reports/SectionResolverPaginationIT.java
  - backend/src/test/java/com/citi/put/checks/reports/SectionResolverTest.java
  - backend/src/test/java/com/citi/put/checks/resilience/CheckExecutionMetricsIT.java
  - backend/src/test/java/com/citi/put/checks/resilience/CircuitBreakerIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/BackpressureIntegrationIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/CapacityGatedDispatchTest.java
  - backend/src/test/java/com/citi/put/checks/scheduling/CronDispatcherBatchIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/CronDispatcherDisabledIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/CronDispatcherDriftIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/CronDispatcherIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/CsiMetricsRefreshIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/DispatcherHealthIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/DstBoundaryTest.java
  - backend/src/test/java/com/citi/put/checks/scheduling/FailedDispatchTest.java
  - backend/src/test/java/com/citi/put/checks/scheduling/ParallelDispatchIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/DefaultPartitionHealthIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/DefaultPartitionIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/PartitionBootstrapIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/PartitionConversionIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/PartitionHealthIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/PartitionIdempotencyIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/PartitionLifecycleIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/PartitionSchedulerIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/RetentionPrunerConfigIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/RetentionPrunerIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/partitioning/RetentionPrunerSkipCurrentIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/RetryDispatcherIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/ScheduleAuthzIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/ScheduleCrudIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/ScheduleEmbedIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/ScheduleEnableDisableIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/ScheduleValidationIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/ShedLockCronDispatcherIT.java
  - backend/src/test/java/com/citi/put/checks/scheduling/ShedLockIT.java
  - backend/src/test/java/com/citi/put/checks/security/AntiRegressionTest.java
  - backend/src/test/java/com/citi/put/checks/security/BffFilter503IT.java
  - backend/src/test/java/com/citi/put/checks/security/BffFilterHappyPathIT.java
  - backend/src/test/java/com/citi/put/checks/security/BffFilterUnauthIT.java
  - backend/src/test/java/com/citi/put/checks/security/CoreContractComplianceTest.java
  - backend/src/test/java/com/citi/put/checks/security/CorsAllowedOriginsConfigIT.java
  - backend/src/test/java/com/citi/put/checks/security/CsiOwnershipEvaluatorTest.java
  - backend/src/test/java/com/citi/put/checks/security/FakeCoreServiceClient.java
  - backend/src/test/java/com/citi/put/checks/security/GatewayHeadersTrustIT.java
  - backend/src/test/java/com/citi/put/checks/security/IdentityCacheIT.java
  - backend/src/test/java/com/citi/put/checks/security/OptionsBypassIT.java
  - backend/src/test/java/com/citi/put/checks/security/PermissionAspectCacheIT.java
  - backend/src/test/java/com/citi/put/checks/smoke/DiscriminatorCheckTest.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/CheckSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/CheckTagSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/CsiSystemSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/CsiTagSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/ExecutionResultSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/ReportExecutionSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/ReportSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/ScheduleSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/SecretSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/TagSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/UiTestExecutionSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/UiTestSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/entity/UserSmokeEntity.java
  - backend/src/test/java/com/citi/put/checks/smoke/IndexCatalogTest.java
  - backend/src/test/java/com/citi/put/checks/smoke/MaterializedViewIT.java
  - backend/src/test/java/com/citi/put/checks/smoke/PartitionBoundaryTest.java
  - backend/src/test/java/com/citi/put/checks/smoke/SchemaSmokeContainerIT.java
  - backend/src/test/java/com/citi/put/checks/smoke/SchemaSmokeTest.java
  - backend/src/test/java/com/citi/put/checks/smoke/TriggersIT.java
  - backend/src/test/java/com/citi/put/checks/users/UserMeEndpointIT.java
  - backend/src/test/java/com/citi/put/checks/users/UserProvisioningIT.java
  - backend/src/test/resources/contracts/authz-check.schema.json
  - backend/src/test/resources/contracts/users-me.schema.json
  - backend/src/test/resources/rds-parity-fixtures/bad/V9999__alter_system.sql
  - backend/src/test/resources/rds-parity-fixtures/bad/V9999__copy_from_program.sql
  - backend/src/test/resources/rds-parity-fixtures/bad/V9999__drop_extension.sql
  - backend/src/test/resources/rds-parity-fixtures/bad/V9999__language_c.sql
  - backend/src/test/resources/rds-parity-fixtures/bad/V9999__server_file_roles.sql
  - backend/src/test/resources/rds-parity-fixtures/bad/V9999__superuser.sql
  - backend/src/test/resources/rds-parity-fixtures/bad/V9999__unknown_extension.sql
  - backend/src/test/resources/rds-parity-fixtures/ok/V9999__all_legal.sql
  - package.json
#>

# === EMBEDDED FILE CONTENTS SECTION ===
$Files = @()
$PartsRoot = Join-Path $PSScriptRoot 'put-checks-fat.parts'
if (-not (Test-Path -LiteralPath $PartsRoot -PathType Container)) {
  throw "Missing payload directory: $PartsRoot"
}
$PartScripts = Get-ChildItem -LiteralPath $PartsRoot -Filter '*.ps1' | Sort-Object Name
if ($PartScripts.Count -eq 0) { throw "No payload part scripts found in $PartsRoot" }
foreach ($part in $PartScripts) {
  Write-Host ('[i] Loading payload page: ' + $part.Name)
  . $part.FullName
}
if ($Files.Count -ne $ExpectedTotalFiles) {
  throw "Loaded $($Files.Count) files, expected $ExpectedTotalFiles. Payload pages may be missing."
}
function Get-EmbeddedBytes {
  param([AllowEmptyString()][string]$Value)
  $clean = $Value -replace '\s+', ''
  return ,([System.Convert]::FromBase64String($clean))
}

# === DIRECTORY AND FILE CREATION SECTION ===
try {
  $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $DestinationRoot = (Get-Location).Path
  $ProjectRoot = Join-Path $DestinationRoot $ProjectName
  Write-Host ('[i] Creating project root: ' + $ProjectRoot)
  if (-not (Test-Path -Path $ProjectRoot)) { New-Item -ItemType Directory -Path $ProjectRoot -Force | Out-Null }

  # Create directories first
  $dirCount = 0
  foreach ($d in @('backend', 'backend/buildSrc', 'backend/buildSrc/src', 'backend/buildSrc/src/main', 'backend/buildSrc/src/main/kotlin', 'backend/buildSrc/src/main/kotlin/rules', 'backend/buildSrc/src/test', 'backend/buildSrc/src/test/kotlin', 'backend/config', 'backend/config/checkstyle', 'backend/config/rds-parity', 'backend/config/spotbugs', 'backend/gradle', 'backend/gradle/wrapper', 'backend/src', 'backend/src/main', 'backend/src/main/java', 'backend/src/main/java/com', 'backend/src/main/java/com/citi', 'backend/src/main/java/com/citi/put', 'backend/src/main/java/com/citi/put/checks', 'backend/src/main/java/com/citi/put/checks/checks', 'backend/src/main/java/com/citi/put/checks/checks/bulk', 'backend/src/main/java/com/citi/put/checks/checks/dto', 'backend/src/main/java/com/citi/put/checks/checks/entity', 'backend/src/main/java/com/citi/put/checks/checks/execution', 'backend/src/main/java/com/citi/put/checks/checks/execution/dto', 'backend/src/main/java/com/citi/put/checks/checks/execution/entity', 'backend/src/main/java/com/citi/put/checks/checks/executors', 'backend/src/main/java/com/citi/put/checks/checks/model', 'backend/src/main/java/com/citi/put/checks/config', 'backend/src/main/java/com/citi/put/checks/config/logging', 'backend/src/main/java/com/citi/put/checks/csi', 'backend/src/main/java/com/citi/put/checks/csi/dto', 'backend/src/main/java/com/citi/put/checks/csi/entity', 'backend/src/main/java/com/citi/put/checks/dashboard', 'backend/src/main/java/com/citi/put/checks/dashboard/dto', 'backend/src/main/java/com/citi/put/checks/reports', 'backend/src/main/java/com/citi/put/checks/reports/dto', 'backend/src/main/java/com/citi/put/checks/reports/entity', 'backend/src/main/java/com/citi/put/checks/reports/mail', 'backend/src/main/java/com/citi/put/checks/reports/render', 'backend/src/main/java/com/citi/put/checks/reports/schedule', 'backend/src/main/java/com/citi/put/checks/reports/section', 'backend/src/main/java/com/citi/put/checks/scheduling', 'backend/src/main/java/com/citi/put/checks/scheduling/dto', 'backend/src/main/java/com/citi/put/checks/scheduling/entity', 'backend/src/main/java/com/citi/put/checks/scheduling/partitioning', 'backend/src/main/java/com/citi/put/checks/secrets', 'backend/src/main/java/com/citi/put/checks/secrets/dto', 'backend/src/main/java/com/citi/put/checks/secrets/entity', 'backend/src/main/java/com/citi/put/checks/security', 'backend/src/main/java/com/citi/put/checks/security/event', 'backend/src/main/java/com/citi/put/checks/studio', 'backend/src/main/java/com/citi/put/checks/studio/dto', 'backend/src/main/java/com/citi/put/checks/studio/entity', 'backend/src/main/java/com/citi/put/checks/studio/validation', 'backend/src/main/java/com/citi/put/checks/tags', 'backend/src/main/java/com/citi/put/checks/tags/dto', 'backend/src/main/java/com/citi/put/checks/templates', 'backend/src/main/java/com/citi/put/checks/templates/dto', 'backend/src/main/java/com/citi/put/checks/templates/entity', 'backend/src/main/java/com/citi/put/checks/users', 'backend/src/main/java/com/citi/put/checks/users/dto', 'backend/src/main/java/com/citi/put/checks/users/entity', 'backend/src/main/resources', 'backend/src/main/resources/db', 'backend/src/main/resources/db/migration', 'backend/src/main/resources/db/seed', 'backend/src/test', 'backend/src/test/java', 'backend/src/test/java/com', 'backend/src/test/java/com/citi', 'backend/src/test/java/com/citi/put', 'backend/src/test/java/com/citi/put/checks', 'backend/src/test/java/com/citi/put/checks/checks', 'backend/src/test/java/com/citi/put/checks/checks/bulk', 'backend/src/test/java/com/citi/put/checks/checks/execution', 'backend/src/test/java/com/citi/put/checks/checks/executors', 'backend/src/test/java/com/citi/put/checks/config', 'backend/src/test/java/com/citi/put/checks/config/logging', 'backend/src/test/java/com/citi/put/checks/csi', 'backend/src/test/java/com/citi/put/checks/dashboard', 'backend/src/test/java/com/citi/put/checks/profile', 'backend/src/test/java/com/citi/put/checks/reports', 'backend/src/test/java/com/citi/put/checks/reports/mail', 'backend/src/test/java/com/citi/put/checks/reports/schedule', 'backend/src/test/java/com/citi/put/checks/resilience', 'backend/src/test/java/com/citi/put/checks/scheduling', 'backend/src/test/java/com/citi/put/checks/scheduling/partitioning', 'backend/src/test/java/com/citi/put/checks/security', 'backend/src/test/java/com/citi/put/checks/smoke', 'backend/src/test/java/com/citi/put/checks/smoke/entity', 'backend/src/test/java/com/citi/put/checks/users', 'backend/src/test/resources', 'backend/src/test/resources/contracts', 'backend/src/test/resources/rds-parity-fixtures', 'backend/src/test/resources/rds-parity-fixtures/bad', 'backend/src/test/resources/rds-parity-fixtures/ok')) {
    $fullDir = Join-Path $ProjectRoot $d
    if (-not (Test-Path -Path $fullDir)) { New-Item -ItemType Directory -Path $fullDir -Force | Out-Null }
    $dirCount++
    Write-Host ("[dir] Created/ensured: $dirCount of $ExpectedTotalDirectories :: " + $fullDir)
  }

  # Write files
  $i = 0
  foreach ($f in $Files) {
    $i++
    $target = Join-Path $ProjectRoot $f.RelativePath
    $parent = Split-Path -Path $target -Parent
    if (-not (Test-Path -Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    try {
      $bytes = Get-EmbeddedBytes $f.ContentBase64
      [System.IO.File]::WriteAllBytes($target, $bytes)
      Write-Host ("[file] Created file $i of $ExpectedTotalFiles :: " + $f.RelativePath)
    } catch {
      Write-Host ("[error] Failed to create: " + $f.RelativePath + " :: " + $_.Exception.Message) -ForegroundColor Red
    }
  }

  $Stopwatch.Stop()
  Write-Host ("[i] Creation completed in " + [math]::Round($Stopwatch.Elapsed.TotalSeconds,2) + "s") -ForegroundColor Green

  # === FINAL VALIDATION ===
  $missing = @()
  $contentDiff = @()
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  foreach ($f in $Files) {
    $target = Join-Path $ProjectRoot $f.RelativePath
    if (-not (Test-Path -Path $target)) { $missing += $f.RelativePath; continue }
    try {
      $diskBytes = [System.IO.File]::ReadAllBytes($target)
      $diskHash = [System.BitConverter]::ToString($sha256.ComputeHash($diskBytes)).Replace('-', '').ToLowerInvariant()
      if ($diskHash -ne $f.Sha256) { $contentDiff += $f.RelativePath }
    } catch {
      Write-Host ("[warn] Could not validate content for: " + $f.RelativePath + " :: " + $_.Exception.Message) -ForegroundColor Yellow
    }
  }
  $sha256.Dispose()

  $createdFiles = Get-ChildItem -LiteralPath $ProjectRoot -File -Recurse -Force | Measure-Object | Select-Object -ExpandProperty Count
  $createdDirs  = Get-ChildItem -LiteralPath $ProjectRoot -Directory -Recurse -Force | Measure-Object | Select-Object -ExpandProperty Count
  Write-Host ("[verify] Expected files: $ExpectedTotalFiles | Created: $createdFiles")
  Write-Host ("[verify] Expected dirs:  $ExpectedTotalDirectories | Created: $createdDirs")

  if ($missing.Count -gt 0) {
    Write-Host '[!] Missing files:' -ForegroundColor Red
    $missing | ForEach-Object { Write-Host ('  - ' + $_) }
  }
  if ($contentDiff.Count -gt 0) {
    Write-Host '[!] Content differences (after newline normalization):' -ForegroundColor Yellow
    $contentDiff | ForEach-Object { Write-Host ('  - ' + $_) }
  }

  Write-Host '[i] Final directory tree:' -ForegroundColor Cyan
  Get-ChildItem -LiteralPath $ProjectRoot -Recurse -Force | ForEach-Object {
    $rel = $_.FullName.Substring($ProjectRoot.Length + 1)
    $depth = ($rel -split '[\/]').Count
    $indent = ('  ' * ([Math]::Max($depth - 1, 0)))
    if (Test-Path -LiteralPath $_.FullName -PathType Container) {
      Write-Host ($indent + '[D] ' + $rel)
    } else {
      Write-Host ($indent + '[F] ' + $rel)
    }
  }

  if ($missing.Count -eq 0 -and $createdFiles -eq $ExpectedTotalFiles -and $contentDiff.Count -eq 0) {
    Write-Host '[SUCCESS] 100% completion verified.' -ForegroundColor Green
  } else {
    Write-Host '[WARN] Validation reported issues. See details above.' -ForegroundColor Yellow
  }

} catch {
  Write-Host ('[fatal] ' + $_.Exception.Message) -ForegroundColor Red
  exit 1
}