# INERT: RECIPE05.md supplies exact separate-status/readonly-buffer steps.
# PREPARATION ONLY. Source only after new exact root exception/install. No operation here.
# Arguments: externally adopted ENTRY_SHA AUTHORITY_SHA, both lowercase SHA256.
[[ "$1" =~ ^[0-9a-f]{64}$ && "$2" =~ ^[0-9a-f]{64}$ ]] || return 1
readonly GATEWAY_FR04_ENTRY_SHA="$1"
readonly GATEWAY_FR04_ROOT_SHA="$2"
readonly GATEWAY_FR04_PYTHON='/opt/homebrew/Cellar/python@3.13/3.13.2/Frameworks/Python.framework/Versions/3.13/bin/python3.13'
readonly GATEWAY_FR04_ENTRY='/Users/brunobuger/orca/workspaces/put-checks/ui-studio/docs/qa/evidence/STUDIO-OBS-011/t0/runtime/obs009-gateway80-offtree03-20261019/failed-red-resource-disposition03/entry.py'
gateway80_failed_red04_invoke() {
  # Readonly SAME-shell consumption precedes Python and publishes no current facts.
  # Failed prequalification cannot create an N record, and cannot be retried here.
  case "$1" in
    negative) [[ -z "${GATEWAY_FR04_NEGATIVE_STARTED-}" ]] || return 1; readonly GATEWAY_FR04_NEGATIVE_STARTED=1 ;;
    held-proof) [[ -z "${GATEWAY_FR04_HELD_STARTED-}" ]] || return 1; readonly GATEWAY_FR04_HELD_STARTED=1 ;;
    archive) [[ -z "${GATEWAY_FR04_ARCHIVE_STARTED-}" ]] || return 1; readonly GATEWAY_FR04_ARCHIVE_STARTED=1 ;;
    final) [[ -z "${GATEWAY_FR04_FINAL_STARTED-}" ]] || return 1; readonly GATEWAY_FR04_FINAL_STARTED=1 ;;
    gate) [[ -z "${GATEWAY_FR04_GATE_STARTED-}" ]] || return 1; readonly GATEWAY_FR04_GATE_STARTED=1 ;;
    postclose) [[ -z "${GATEWAY_FR04_POSTCLOSE_STARTED-}" ]] || return 1; readonly GATEWAY_FR04_POSTCLOSE_STARTED=1 ;;
    *) return 1 ;;
  esac
  if [[ "$1" == negative ]]; then
    [[ "$#" == 1 && "${GATEWAY_FR04_SETUP_SHA-}" =~ ^[0-9a-f]{64}$ && "${GATEWAY_FR04_SETUP_COMPLETION_SHA-}" =~ ^[0-9a-f]{64}$ ]] || return 1
    set -- "$1" "$GATEWAY_FR04_SETUP_SHA" "$GATEWAY_FR04_SETUP_COMPLETION_SHA" "$GATEWAY_FR04_SETUP_COMPLETION_BUFFER"
  fi
  [[ "$#" == 4 && "$2" =~ ^[0-9a-f]{64}$ && "$3" =~ ^[0-9a-f]{64}$ ]] || return 1
  "$GATEWAY_FR04_PYTHON" -B -c '
import hashlib,json,os,stat,sys
STAGES=("ENTRY_BUFFER", "AUTHORITY_BUFFER", "AUTHORITY_SHAPE", "N03_CUSTODY", "PRIOR_N01_CUSTODY", "OLD_E_MEMBERSHIP", "N03_MEMBERSHIP", "NEW_REVIEW_BUFFERS", "SOURCE06_LEAF", "SOURCE06_PACKAGE", "EXTERNAL_SOURCE_BUFFERS", "LIBRARY_DEFINITIONS", "OLD_RELEASE_METADATA", "DIRECTORY_CUSTODY", "CORE_DEFINITIONS", "REQUIRED_BINARY_MAP", "UTILITY_PRELAUNCH", "CLIENT_HOLDER_QUALIFICATION", "CLOSE_ACCOUNTING", "UNMAPPED_FAILURE", "N02_CUSTODY", "N02_MEMBERSHIP", "SELF_TEXT_VALIDATION", "TYPED_OWNER_RULINGS", "PRIOR_N02_CUSTODY", "CONTROL_AUTHOR", "FINAL_GUARDED_ACCEPTANCE", "CONTROL_AUTHOR_WRITE", "STATE_PUBLICATION", "OPERATOR_COMPLETION")
REASON_REGISTRY={"CUSTODY_HOLD": ["ARCHIVE_FILE_CAP_TYPE", "ARCHIVE_TOTAL_BYTE_CAP", "COPY_BYTE_BUDGET", "COPY_CLOSE_UNCONFIRMED", "COPY_EXPECTED_BYTES", "COPY_EXPECTED_METADATA", "COPY_OUTPUT_CHANGED", "COPY_READ_PARTIAL", "COPY_SOURCE_CHANGED", "COPY_SOURCE_TYPE_OWNER", "CUSTODY_CLOSE_UNCONFIRMED", "CUSTODY_DIRECTORY_CHANGED", "CUSTODY_MEMBERS", "CUSTODY_OWNER_MODE", "CUSTODY_PATH", "EXCLUSIVE_OUTPUT", "EXCLUSIVE_OUTPUT_CUSTODY", "EXCLUSIVE_OUTPUT_INODE", "FILE_IDENTITY_CHANGED", "FILE_OWNER_MODE_CAP", "LINK_CHANGED", "LINK_ENTRY", "LINK_ENTRY_TYPE", "MEMBER", "MKDIR_CREATION_MARKER", "MKDIR_NAME", "OUTPUT_IDENTITY_CHANGED", "READ_CAP", "READ_EXPECTED_METADATA", "READ_PARTIAL", "WRITE_BYTES", "WRITE_PARTIAL"], "PROTOCOL_HOLD": ["ACTUAL_ADMISSION_STATUSES", "ACTUAL_ARCHIVE_QA_INSPECTED", "ACTUAL_ARCHIVE_RECEIPT_PIN", "ACTUAL_GATE_WRAPPER_CHAIN", "ACTUAL_WRAPPER_ONE", "ADMISSION_HASH_CHAIN", "ADMISSION_INSPECTIONS", "ADMITTED_HELD_PROOF", "ANCHORED_CURRENT_PARENT", "ARCHIVE_COPY_EQUALITY", "ARCHIVE_ENTRY_CAP", "ARCHIVE_FILE_CAP_TYPE", "ARCHIVE_ROOT_TYPE_OWNER", "ARCHIVE_TOTAL_BYTE_CAP", "AUTHORITY_UNKNOWN_FIELD", "AUTHOR_ACTUAL_HELPER_FACTS", "AUTHOR_AUTHORITY_RAW_PIN", "AUTHOR_EXACT_ROOT_FACTS", "AUTHOR_INSTALLED_SAME_BUFFER", "AUTHOR_ONCE_NO_REWRITE", "AUTHOR_PRIOR_CLIENT_ACTUAL_STATUS", "AUTHOR_REQUEST_SCHEMA", "AUTHOR_REQUEST_SCOPE", "AUTHOR_SOURCE_GRAPH", "AUTHOR_STATE_BYTE_CAP", "AUTHOR_STATE_ENTRY_CAP", "AUTHOR_STATE_IDENTITY", "AUTHOR_STATE_MEMBER", "AUTHOR_STATE_MEMBERSHIP", "AUTHOR_STATE_OUTER_STATUS", "AUTHOR_STATE_RAW_PIN", "AUTHOR_STATE_SCOPE", "BIN_APP_ROLE_MISMATCH", "BOUNDED_JSON", "CANONICAL_EXTERNAL_PIN", "CENSUS_COMPLETE", "CENSUS_DUPLICATE", "CLEANUP_FAILURE_BOUND", "CLIENT_HISTORY_PHYSICAL_FINGERPRINT", "CLIENT_HISTORY_ROLES", "CLIENT_HISTORY_TYPED_IDENTITY", "CLIENT_IDENTITY_CHANGED", "CLIENT_IMAGE_MAP", "CLIENT_JOURNAL", "CLIENT_NAME", "CLIENT_PID_START_ARGV_PROCESS", "CLOCK_TYPE", "CODE_PINS", "CONFLICTING_EXPLICIT_INPUT_PIN", "CONFLICTING_EXTERNAL_PIN", "CONTROL_AUTHOR_ACTUAL_IDS", "CONTROL_AUTHOR_MUST_BE_PENDING", "CONTROL_AUTHOR_REQUIRED", "CONTROL_AUTHOR_SOURCE_BINDING", "CONTROL_MODE", "CONTROL_UNKNOWN_FIELD", "COPY_BYTE_BUDGET", "COPY_DIRECTORY_TYPE", "COPY_ENTRY_IDENTITY", "COPY_ENTRY_KIND", "COPY_EXPECTED_BYTES", "COPY_EXPECTED_METADATA", "COPY_OUTPUT_CHANGED", "COPY_READ_PARTIAL", "COPY_RELATIVE_ENTRY", "COPY_SOURCE_CHANGED", "COPY_SOURCE_TYPE_OWNER", "CURRENT_CLIENT_NOT_RECORDED", "CURRENT_CLIENT_REUSED_OR_REPARENTED", "CURRENT_GATEWAY_MARKER", "CURRENT_PARENT_CENSUS_CHANGED", "CURRENT_UNKNOWN_PROJECT_ROLE", "CURRENT_UTILITY_UNKNOWN", "CUSTODY_CLOSE_UNCONFIRMED", "CUSTODY_DIRECTORY_CHANGED", "CUSTODY_MEMBERS", "CUSTODY_OWNER_MODE", "CUSTODY_PATH", "DUPLICATE_JSON", "EXACT_BINARY_MODES_HASHES", "EXACT_EXTERNAL_CONTROL_ARGUMENT", "EXACT_EXTERNAL_SOURCE_PIN_MAP", "EXACT_FAILED_RESOURCE_CLI", "EXACT_FAILED_SUBJECT", "EXACT_FINAL_RESULT_TYPES", "EXACT_NEW_CODE_REVIEWS_OWED", "EXACT_THREE_NEW_CODE_RECORDS", "EXACT_WAITED_CENSUS_PROBE", "EXCLUSIVE_FINAL_ATTEMPT_CHAIN", "EXCLUSIVE_OUTPUT", "EXCLUSIVE_OUTPUT_CUSTODY", "EXCLUSIVE_OUTPUT_INODE", "EXTERNAL_CONTROL_BEFORE_PARSE", "EXTERNAL_CONTROL_PIN_MAP", "EXTERNAL_CONTROL_SHA", "EXTERNAL_PIN_REQUIRED", "FACTORY_BASE_TYPE", "FACTORY_CANONICAL_ROLE", "FACTORY_EXACT_CANONICAL_ROLE_BINDINGS", "FACTORY_EXACT_SEVEN_UNIQUE", "FACTORY_EXACT_SIX_BUFFERS", "FACTORY_EXACT_SOURCE_REVIEWS", "FACTORY_EXTERNAL_GRAPH", "FACTORY_FINAL_N_BINDING", "FACTORY_FOUR_PYTHON_ROLES", "FACTORY_INDEPENDENT_REVIEW_SUBJECT", "FACTORY_NO_CALLER_BINARY_MAP", "FACTORY_NO_FUTURE_CONTROL_CYCLE", "FACTORY_NO_PRECREATE_N_FACT", "FACTORY_OPENED_N_FACT", "FACTORY_PRIOR_AND_INDEX", "FACTORY_REVIEW_CONSUMED_BUFFERS", "FACTORY_ROLE_CONFLICT", "FACTORY_SAME_VALIDATED_DRAFT", "FACTORY_SAME_WITNESSES", "FACTORY_SEVEN_WITNESSES", "FACTORY_SOURCE_CODE_GRAPH", "FACTORY_SOURCE_MANIFEST_SHAPE", "FACTORY_THREE_UTILITY_ROLES", "FACTORY_TYPED_PHYSICAL_PYTHON_ROLES", "FACTORY_WITNESS_BINDING", "FACTORY_WITNESS_TYPES", "FAILED_ARCHIVE_EQUALITY_DRIFT", "FAILED_ARCHIVE_RELEASE", "FAILED_ONLY", "FAILED_W_CHANGED_DURING_ARCHIVE", "FAILURE_AFTER_FINALIZATION", "FAILURE_SINK_ARGV_BOUND", "FAILURE_SINK_BYTES_BOUND", "FAILURE_SINK_CHILD_BOUND", "FILE_IDENTITY_CHANGED", "FILE_OWNER_MODE_CAP", "FINALIZATION_OWNER_CONFLICT", "FINALIZATION_OWNER_REQUIRED", "FINALIZATION_OWNER_TOKEN", "FINITE_RELEVANT_LISTENER", "FRESHNESS_OR_CLOCK_REVERSE", "GATE_DELIVERY_PREPARATION", "GATE_ORIGINAL_PINS", "GATE_OUTER_GUARD_REQUIRED", "GATE_PROOF_SUBJECT", "GATE_QUALIFICATION_ONCE", "GATE_SELECTED_CLEANUP_COMPLETE", "HISTORICAL_SAME_START_LIVE", "IMMUTABLE_BUFFER_SUBSTITUTED", "IMMUTABLE_FILE_IDENTITY_CHANGED", "IMMUTABLE_MODE_CONFLICT", "INDEPENDENT_ACTUAL_QA_PIN", "INHERITED_BOUNDARY", "INSTALL_CANDIDATE_SHAPE", "INSTALL_CONTRACT_BUFFER", "INSTALL_DERIVED_MAPS_ONLY", "INSTALL_EXACT_APPROVED_READSET", "INSTALL_EXACT_SEVEN_NEW_MEMBERS", "INSTALL_FIXED_DESTINATION", "INSTALL_INPUT_CONFLICT", "INSTALL_INPUT_PIN", "INSTALL_N_IDENTITY_STABLE", "INSTALL_OLD_E_EXACT_ANCESTRY", "INSTALL_OLD_E_IDENTITY", "INSTALL_OLD_E_UNCHANGED_BYTES_MODES", "INSTALL_ONCE_NO_RESET", "INSTALL_OUTSIDE_CUSTODY", "INSTALL_OUTSIDE_E_TRACE_SCOPE", "INSTALL_OUTSIDE_MEMBER_TYPE", "INSTALL_POST_WRITE_EQUALITY", "INSTALL_PRIOR_FIXED_DIRECTORY", "INSTALL_PRIOR_IDENTITY_MEMBERS", "INSTALL_PRIOR_MEMBER_IDENTITY", "INSTALL_REVIEWED_SOURCE_PIN", "INSTALL_ROOT_SCOPE", "INSTALL_STRICT_OUTSIDE_NAMES", "INSTALL_TYPED_DIRECTORY_FACT", "INSTALL_VERIFIED_CONSUMED_INPUT", "KERNEL_LOCK_INODE", "KERNEL_UNKNOWN", "KNOWN_ACTOR_NUMERIC_PRESENT_HOLD", "LINK_CHANGED", "LINK_ENTRY", "LINK_ENTRY_TYPE", "LOCAL_NAME", "LOCK_NAMED_FD", "MEMBER", "MKDIR_CREATION_MARKER", "MKDIR_NAME", "NEGATIVE_CLIENT_CHAIN", "NEGATIVE_DENIAL", "NEGATIVE_ORDER", "NEW_CODE_RECORD_SCOPE", "NEW_NODE_E_RELATED_CWD", "NEW_ROOT_EXCEPTION", "NONFINITE", "NONREVERSING_CLOCK", "NO_NATIVE_OR_ALTERNATE_MODE", "NO_NATIVE_TOOL", "NO_OUTPUT_BEFORE_QUALIFICATION", "NO_SOURCE_NATIVE_CREDIT", "N_CONTROL_PIN_SCOPE", "N_MEMBER_MODE_OWNER", "N_ONLY_LIBRARY_WRITE", "N_ONLY_NEW_DIRECTORY_PIN_SCOPE", "N_ONLY_OUTPUT_NAME", "N_ONLY_PHYSICAL_ARCHIVE", "N_STRICT_MEMBER_NAME", "OBSERVER_UMASK_077", "OLD_EXACT_COUNT", "OLD_E_BYTES_CHANGED", "OLD_E_MEMBERSHIP_PLUS_N_ONLY", "ONLY_DEPENDENCY_LINK_ENTRY", "ORIGINAL_22_CHART", "ORIGINAL_E_W_NOT_N", "ORIGINAL_FAILED_W_ARCHIVE_DRIFT", "ORIG_ARGV_APP_LITERAL_MISMATCH", "OUTPUT_IDENTITY_CHANGED", "OWNED_W_IDENTITY", "PERMIT_EXACT_CHAIN_PINS", "POSTCLOSE_KERNEL_NOT_FREE", "POSTCLOSE_OLD_CONTROLLER_LIVE", "PRIOR_CLIENT_LIVE", "PRIOR_INDEX_DIRECTORY_BINDING", "PRIOR_INDEX_EXACT_BUFFERS", "PRIOR_INDEX_EXACT_MEMBERS", "PRIOR_INDEX_MEMBER_BINDING", "PRIOR_INDEX_RAW_PIN", "PRIOR_N01_EXACT_SEVEN", "PRIOR_N01_IDENTITY", "PRIOR_N01_MEMBER_DRIFT", "PRIOR_NAMESPACE_EXACT_MEMBERS", "PRIOR_NAMESPACE_IDENTITY", "PRIOR_NAMESPACE_MEMBER_DRIFT", "PROVISIONAL_CHILD_CAP_OR_PENDING", "PYTHON_FOUR_ROLES", "PYTHON_ROLE_CANONICAL", "RAW_ARCHIVE_SET", "RAW_FAILED_ARTIFACT_EQUALITY", "READINESS_PERMIT_CHAIN", "READ_CAP", "READ_EXPECTED_METADATA", "READ_PARTIAL", "REQUESTED_LAUNCH_OPERATOR_TRACE", "ROOT_AUTHORITY", "ROOT_COMPLETION_ACTOR_BOUND", "ROOT_COMPLETION_ACTOR_SCHEMA", "ROOT_COMPLETION_ACTUAL_TOOL_EVIDENCE", "ROOT_COMPLETION_AUTHOR_CONFLICT", "ROOT_COMPLETION_BUFFER_SHA", "ROOT_COMPLETION_EXACT_PENDING_SET", "ROOT_COMPLETION_SOURCE_BINDING", "ROOT_INPUT_PINS", "ROOT_NO_HISTORICAL_REPAIR", "ROOT_N_OPENED_IDENTITY", "ROOT_ROLE_OR_SCOPE", "ROOT_SUBJECT_PINS", "SELF_TEXT_DIGEST_COUNT_MISMATCH", "SELF_TEXT_SCHEMA", "SEPARATE_FAILED_PERMIT", "SEPARATE_NEGATIVE_STATUS", "SETUP_BOUNDED_HELPERS", "SETUP_HELPER_ACTUAL_COMPLETION", "SETUP_HELPER_JOIN_TYPES", "SETUP_HELPER_NUMERIC_PRESENT_HOLD", "SETUP_ROOT_ATTESTATIONS", "SETUP_SAME_READONLY_BUFFER", "SETUP_SEPARATE_STATUSES", "SETUP_TYPED_HELPER_IDENTITY", "SOURCE_BEFORE_AFTER_CHANGED", "SOURCE_LIMITS", "STARTLESS_NUMERIC_PRESENT_HOLD", "TYPED_ACTOR_COMPLETION_UNKNOWN", "TYPED_ACTOR_EXTERNAL_EVIDENCE", "TYPED_ACTOR_KNOWN_EVIDENCE", "TYPED_ACTOR_KNOWN_OMITTED", "TYPED_ACTOR_ROSTER_COMPLETE", "TYPED_ACTOR_ROSTER_CONFLICT", "TYPED_ACTOR_ROSTER_SCHEMA", "TYPED_CONTROL_BINDING", "TYPED_LOCAL_RECORD_BINDING", "TYPED_OWNER_CODE_REVIEW_BINDING", "TYPED_OWNER_EXACT_DECISION", "TYPED_OWNER_EXACT_SCALAR_SCHEMA", "TYPED_OWNER_RAW_PIN", "TYPED_OWNER_RULINGS_REQUIRED", "TYPED_RESULT_BINDING", "TYPED_ROLE_CONTRACT_SCOPE", "UNACCOUNTED_DESCENDANTS", "UNIT_CLOSE_UNCONFIRMED", "UNPINNED_PREEXISTING_N_MEMBER", "UTILITY_ARGV", "UTILITY_BINDING_LENGTH", "UTILITY_CANONICAL_BINDING", "UTILITY_CANONICAL_NO_ALIAS", "UTILITY_HISTORY_CANONICAL_COMMAND", "UTILITY_HISTORY_COMPLETE_HASHES", "UTILITY_HISTORY_NAME_PID", "UTILITY_HISTORY_UNKNOWN", "UTILITY_NO_RESULT_ONLY", "UTILITY_PARTIAL_OR_NONZERO_OR_STDERR", "UTILITY_PID", "VERIFIED_CONSUMED_BUFFER_CHANGED", "VERIFIED_ENTRY_ONLY", "WAITED_CENSUS_PROBE", "WRAPPER_EXACT_PIN_CHAIN", "WRITE_BYTES", "WRITE_PARTIAL"], "SOURCE06_VALUE_ERROR": ["ABSOLUTE_READER_PATH", "ACTUAL_ROOT_RELEASE_REQUIRED", "ACTUAL_WRAPPER_ZERO_REQUIRED", "ARCHIVE_ALREADY_EXISTS", "ARCHIVE_EQUALITY_FAILED", "ARCHIVE_ROOT_SCOPE", "AUXILIARY_CHANGED", "AUXILIARY_MODE_BINDINGS", "BANK_CHANGED", "BOOTSTRAP_VERIFIED_BUFFER_MISMATCH", "BOUNDED_OBSERVATION_FAILED", "CANDIDATE_COMM_PARSE", "CANDIDATE_TABLE_EMPTY_OR_BOUND", "CASE_IDENTITY_MULTISET_MISMATCH", "CHART_BYTES_OR_MODE", "CHART_DIRECTORY_PATH_SET", "CHART_EXACT_22_PATH_SET", "CHART_SYMLINK_FORBIDDEN", "COMM_CURRENT_HOLDER_MISSING", "CONFLICTING_IMMUTABLE_CONTROL_PIN", "CONTROL_PIN_NAME", "CONTROL_PIN_SHA", "COPIED_FILE_IDENTITY_CHANGED", "COPIED_INPUT_CHANGED", "COPY_PARENT_OUTSIDE_WORKSPACE", "COPY_SOURCE_IDENTITY_CHANGED", "CURRENT_IMMUTABLE_BYTES_CHANGED", "CURRENT_OBSERVER_IDENTITY_NOT_BOUND", "CUSTODY_DESTINATION_EXISTS_OR_LINK", "CUSTODY_DIRECTORY_IDENTITY_CHANGED", "CUSTODY_DIRECTORY_OR_ROOT_LINK", "CUSTODY_LEAF_LINK", "CUSTODY_LEAF_TYPE", "CUSTODY_PARENT_FD_IDENTITY", "CWD_IDENTITY_CHANGED", "CWD_OBSERVATION_MISSING_OR_AMBIGUOUS", "DECISION_RELEASE", "DEPENDENCY_SYMLINK_CHANGED", "DEPENDENCY_TARGET_CHANGED", "DEPENDENCY_TREE_CHANGED", "DIST_CHANGED", "DIST_PATH_SET", "DUPLICATE_COMM_PID", "ENTRY_KIND", "ENTRY_RELEASE_PATH", "EXACT_GENERATION06_PACKAGE_REQUIRED", "EXACT_PERMIT_SHA_REQUIRED", "EXPECTED_REGULAR_FILE", "EXPECTED_SHA_REQUIRED", "EXPLICIT_IMMUTABLE_CONTROL_PINS_REQUIRED", "FILE_COLLECTION_OR_HOOK_ERROR", "FILTERED_CASE_RAN", "FINAL_CHART_ARCHIVE_MISMATCH", "FINAL_CHART_NOT_22", "FINAL_READINESS_AND_RESULT_REQUIRED", "FINAL_REQUIRES_RELEASESHA_ACTUALREVIEWADOPTIONSHA", "FIXED_BANK_CHANGED", "FIXED_BANK_READ_CHANGED", "FIXTURE_SCRATCH_CLEANUP_FAILED", "FRESH_ROOT_CUSTODY_BINDINGS_REQUIRED", "GATEWAY_BOUNDARY_CENSUS_INCOMPLETE", "GATEWAY_MARKER_SURVIVOR_OR_UNOWNED_CANDIDATE", "GLOBAL_COMM_EMPTY", "GLOBAL_PS_FAILED_OR_EMPTY", "GLOBAL_TABLE_DUPLICATE_PID", "GLOBAL_TABLE_INCOMPLETE", "GLOBAL_TABLE_PARSE", "GREEN_FAILURE_MESSAGES", "GREEN_NATIVE_EXIT_OR_SUCCESS", "GREEN_STATUS_COUNTS", "GREEN_SUMMARY_COUNTS", "HELM_CHANGED", "HOLDER_ARGV_CHANGED", "HOLDER_IDENTITY_LOST", "HOLDER_PARENT", "HOLD_MODE", "IMMUTABLE_BUFFER_TYPE", "IMMUTABLE_PATH_SUBSTITUTED", "INHERITED_NODE_CHANGED", "INSTALL_EXACT_ORIGINAL_PREIMAGE_REQUIRED", "INSTALL_TARGET_IDENTITY_CHANGED", "INTENDED_RED_REQUIRED", "INVENTORY_ROOT_CHANGED", "KERNEL_LOCK_FD_IDENTITY", "KERNEL_LOCK_NOT_HELD", "KERNEL_LOCK_UNKNOWN", "LOCK_BINDING_TYPE", "LOCK_DESCRIPTOR_MALFORMED", "LOCK_DESCRIPTOR_NONCANONICAL", "LOCK_FIELDS_INCOMPLETE", "LOCK_FIELD_ORDER_OR_DUPLICATE", "LOCK_REPLACED", "LOCK_RETURNED_INODE_MISMATCH", "LOCK_RETURNED_NAME_MISMATCH", "LOCK_RETURNED_PID_MISMATCH", "LSOF_OBSERVATION_FAILED_OR_EMPTY", "MAIN_506", "MISSING_ASSERTIONS", "MISSING_NATIVE_STATUS", "NATIVE_OWNERSHIP_HOLD", "NODE_CANDIDATE_BOUND", "NODE_CHANGED", "NOT_DIRECT_HELD_SHELL_CHILD", "OBSERVATION_ARGV_TYPE", "OBSERVATION_BINARY_CHANGED", "OBSERVATION_BINARY_READER_REQUIRED", "OBSERVATION_CHILD_PID_UNKNOWN", "OBSERVATION_CLIENT_BINDING_CHANGED", "OBSERVATION_CLIENT_CENSUS_ANCHOR", "OBSERVATION_CLIENT_ROW_INCOMPLETE", "OBSERVATION_COMMAND_FAILED", "OBSERVATION_HISTORY_BOUND", "OBSERVATION_LAUNCH_UNKNOWN_NO_SIGNAL", "OBSERVATION_NOT_COMPLETE_OR_WAITED", "OBSERVATION_RECORD_NOT_READY", "OBSERVATION_STDERR_UNQUALIFIED", "OBSERVATION_UNKNOWN_NO_SIGNAL", "ONE_COMPLETE_FILE_REQUIRED", "ONE_SHOT_PHASE_ALREADY_CONSUMED", "OPTIMIZED_PYTHON_FORBIDDEN", "ORIGINAL_CONTROLLER_STILL_LIVE", "OWNED_ROOT_CHANGED", "PACKET_MEMBER_CHANGED", "PACKET_MEMBER_METADATA", "PACKET_MEMBER_PATH", "PACKET_SEAL", "PARENT_UMASK_MUST_ALREADY_BE_077", "PATH_OUTSIDE_APPROVED_CUSTODY", "PHASE_RECEIPT_EXISTS", "PHASE_REQUIRES_PHASE_RELEASEPATH_RELEASESHA_DECISIONSHA", "POSTCLOSE_LOCK_CHANGED", "POSTCLOSE_LOCK_FD_CHANGED", "POSTCLOSE_OLD_CONTROLLER_SURVIVES", "POSTCLOSE_PHASE_RECEIPT", "POSTCLOSE_RECORDED_IDENTITY_SURVIVES", "POSTCLOSE_REQUIRES_RELEASESHA_WRAPPERRESULTSHA", "POSTCLOSE_SOURCE_CHANGED", "PRECEDING_RECEIPT_NOT_ACCEPTED", "PRECEDING_RECEIPT_SHA", "PREDECESSOR_BINDINGS", "PREDECESSOR_PHASE_NAME", "PREUNIT_CANDIDATE_BASELINE_REQUIRED", "PRIOR_OBSERVATION_CHILD_BINDING_INCOMPLETE", "PRIOR_OBSERVATION_CHILD_UNKNOWN_OR_UNWAITED", "PRIOR_OBSERVATION_CLIENT_IDENTITY_UNKNOWN", "PRIOR_OBSERVATION_CLIENT_SURVIVES", "PROCESS_CENSUS_INCOMPLETE", "READ_RACE", "RED_FAILURE_ARITY", "RED_NATIVE_EXIT_OR_SUCCESS", "RED_STATUS_COUNTS", "RED_SUMMARY_COUNTS", "RELEASE_PATH", "REPORT_NOT_OBJECT", "RESIDENT_WORKER_OR_UNKNOWN_CANDIDATE", "RESOURCE_BOUNDARY_HOLD", "REVIEWS_REQUIRED", "ROOT_PHASE_DECISION_REQUIRED", "ROOT_RELEASE_SCOPE", "RUNTIME_SUITE_ERROR", "SCOPED_PS_OBSERVATION_FAILED", "SCOPE_WIDENING", "SELECTED_RED_DID_NOT_FAIL", "SOURCE_BYTES_OR_MODE_CHANGED", "SOURCE_PATH_SET", "SOURCE_RELEASE_DIGEST", "SUCCESS_ONLY_EXPLICIT_GATE_CALL", "SYMLINK_PARENT", "TABLE_COLLECTOR_PARENT_MISMATCH", "TABLE_CURRENT_COLLECTOR_OR_PARENT_MISSING", "TABLE_HELD_PARENT_MISMATCH", "TABLE_HOLDER_INCONSISTENT", "TMPDIR_NOT_EMPTY_BEFORE_PHASE", "TODO_TEST", "TOOL_ALIAS_TARGET_CHANGED", "TOTAL_TEST_COUNT", "UNAPPROVED_ARCHIVE_LINK", "UNBOUND_IMMUTABLE_JSON_INPUT", "UNBOUND_OBSERVATION_BINARY", "UNBOUND_PRECEDING_RECEIPT", "UNBOUND_SAFE_ENV", "UNDECLARED_BASELINE_READER_PATH", "UNEXPECTED_PREEXISTING_COPY_PARENT", "UNEXPECTED_WORKSPACE_ENTRY", "UNKNOWN_PHASE", "UNREVIEWED_ENV_KEY", "UNSAFE_EVIDENCE_ROOT", "UNSAFE_FILE", "UNSAFE_WORKSPACE_ROOT", "USAGE: phase release-path exact-release-sha decision-sha", "VERIFIED_IMMUTABLE_BUFFER_CHANGED", "VERIFIED_READER_ANCESTOR_CHANGED", "VERIFIED_READER_LEAF_CHANGED", "VERIFIED_READER_REGULAR", "VERIFIED_SCOPE", "WORKSPACE_ALREADY_EXISTS", "WRITE_OUTSIDE_OWNED_ROOTS", "WRONG_FILE", "WRONG_HOLD", "WRONG_LOCK_PATH", "WRONG_RED_ASSERTION_SOURCE_FRAME", "WRONG_RED_EXPECTATION"], "BOOTSTRAP_VALUE_ERROR": ["AUTHOR_REQUEST_RAW_PIN", "BOOTSTRAP_ANCESTOR", "BOOTSTRAP_CHANGED", "BOOTSTRAP_CLOSE_UNCONFIRMED", "BOOTSTRAP_LEAF", "BOOTSTRAP_N_MODE", "BOOTSTRAP_SHORT", "BUFFER_INTEGRITY", "BUFFER_METADATA", "CLEANUP_FAILURE_BOUND", "CODE_ROOT_PINS", "CODE_VERIFIED_BUFFER", "DUPLICATE_ROOT_CONTROL", "EXTERNAL_AUTH_SHA", "FAILED_BOOTSTRAP_INTEGRITY", "FAILURE_AFTER_FINALIZATION", "FAILURE_SINK_ARGV_BOUND", "FAILURE_SINK_BYTES_BOUND", "FAILURE_SINK_CHILD_BOUND", "FINALIZATION_OWNER_CONFLICT", "FINALIZATION_OWNER_REQUIRED", "FINALIZATION_OWNER_TOKEN", "INSTALL_BOOTSTRAP_ANCESTOR", "INSTALL_BOOTSTRAP_CHANGED", "INSTALL_BOOTSTRAP_METADATA", "INSTALL_BOOTSTRAP_PARTIAL", "INSTALL_DERIVED_MAPS_ONLY", "INSTALL_DERIVED_READSET_POLICY", "INSTALL_DUPLICATE_SCOPE", "INSTALL_ENTRY_SOURCE_GRAPH", "INSTALL_EXTERNAL_SCOPE_SHA", "INSTALL_FIXED_SCOPE_PATH", "INSTALL_LOADER_REVIEWED_GRAPH", "INSTALL_LOADER_SHA", "INSTALL_NONFINITE_SCOPE", "INSTALL_REVIEWED_SOURCE_PIN", "INSTALL_SCOPE_UNKNOWN_FIELD", "INSTALL_SOURCE_MANIFEST_DUPLICATE", "INSTALL_SOURCE_MANIFEST_SHA", "INSTALL_SOURCE_MANIFEST_SHAPE", "INSTALL_VERIFIED_ENTRY_REQUIRED", "OUTER_FAILURE_SINK_REQUIRED"], "OS_ERROR": ["OS_ERROR"], "UNMAPPED_FAILURE": ["UNMAPPED_FAILURE"]}
class BootstrapValueError(ValueError):namespace="BOOTSTRAP_VALUE_ERROR"
class FailureSink:
    """One root/operator trace record; never an N fact or qualified observation."""
    def __init__(self,emit,pid=None,ppid=None):
        self.emit,self.pid,self.ppid=emit,pid,ppid;self.owner=None;self.finalized=False;self.finalizer_token=None;self.finalizer_label=None;self.primary_type=None;self.cleanup_seen={};self.namespace_state=None;self.bootstrap_fds=[];self.resources=[];self.bounded_metadata_omitted=False;self.stage="ENTRY_BUFFER";self.primary_failure=None;self.cleanup_failures=[];self.gate_qualification=None
    def text(self,value,maximum):
        if value is None:return None
        if type(value)is str and len(value)<=maximum:return value
        self.bounded_metadata_omitted=True;return None
    def number(self,value,minimum,maximum):
        if value is None:return None
        if type(value)is int and minimum<=value<=maximum:return value
        self.bounded_metadata_omitted=True;return None
    def classify(self,error,stage=None):
        namespace=getattr(type(error),"namespace",getattr(error,"namespace",None))
        if isinstance(error,OSError):namespace="OS_ERROR";reason="OS_ERROR"
        else:
            reason=error.args[0] if len(error.args)==1 and type(error.args[0])is str else None
            if namespace not in REASON_REGISTRY or reason not in REASON_REGISTRY[namespace]:namespace="UNMAPPED_FAILURE";reason="UNMAPPED_FAILURE"
        actual_stage=getattr(error,"failure_stage",self.stage) if stage is None else stage
        return dict(stage=actual_stage if actual_stage in STAGES else "UNMAPPED_FAILURE",namespace=namespace,reason=reason)
    def require_finalizer(self):
        if self.finalizer_token is None or self.finalized:raise BootstrapValueError("FINALIZATION_OWNER_REQUIRED")
    def claim_finalizer(self,label):
        if self.finalizer_token is not None or label not in ("GUARD","INSTALL_LOADER","DIRECT_RUN","DIRECT_INSTALL_CLI","DIRECT_ENTRY","CALLER","DIRECT_CONTROL_AUTHOR","CONTROL_AUTHOR_LOADER"):raise BootstrapValueError("FINALIZATION_OWNER_CONFLICT")
        self.finalizer_token=object();self.finalizer_label=label;return self.finalizer_token
    def primary(self,error,stage=None):
        if self.finalized:raise BootstrapValueError("FAILURE_AFTER_FINALIZATION")
        if self.primary_failure is None:self.primary_failure=self.classify(error,stage);self.primary_type=type(error).__name__[:128]
        for cleanup in getattr(error,"cleanup_failures",[]):self.cleanup(cleanup)
    def cleanup(self,error):
        if self.finalized:raise BootstrapValueError("FAILURE_AFTER_FINALIZATION")
        if id(error) in self.cleanup_seen:return
        self.cleanup_seen[id(error)]=error
        if self.primary_type is None:self.primary_type=type(error).__name__[:128]
        if len(self.cleanup_failures)>=64:raise BootstrapValueError("CLEANUP_FAILURE_BOUND")
        self.cleanup_failures.append(self.classify(error,"CLOSE_ACCOUNTING"))
    def forward(self,error):
        """Accumulate only. The selected outer cleanup owner must finalize."""
        self.primary(error)
    def finalize(self,token):
        self.require_finalizer()
        if token is not self.finalizer_token:raise BootstrapValueError("FINALIZATION_OWNER_TOKEN")
        if self.primary_failure is None and not self.cleanup_failures and self.gate_qualification is not None:
            try:
                self.gate_qualification.prepare_delivery()
                accepted=self.gate_qualification.accept_after_cleanup(self,token)
            except BaseException as error:self.primary(error,"FINAL_GUARDED_ACCEPTANCE")
            else:self.finalized=True;return accepted
        self.finalized=True
        if self.primary_failure is None and not self.cleanup_failures:return None
        owner=self.owner
        current=(getattr(owner,"client",None) or getattr(owner,"provisional_client",None)) if owner is not None else None
        known=[];utilities=getattr(owner,"utilities",[]) if owner is not None else []
        prequalified=getattr(owner,"prequalified",False) is True
        selected=[r for r in utilities if not prequalified or r.get("classification")!="WAITED_POPEN_CHILD" or r.get("terminal") is not True]
        # Launch bounds guarantee this is closed; no truncation of unknown children.
        if len(selected)>64:raise BootstrapValueError("FAILURE_SINK_CHILD_BOUND")
        for row in selected:
            command=row.get("command")
            if type(command)is not list or len(command)>16 or not all(type(x)is str and len(x)<=1024 for x in command):raise BootstrapValueError("FAILURE_SINK_ARGV_BOUND")
            status=row.get("status");pid=row.get("pid")
            known.append(dict(pid=self.number(pid,1,2147483647),command=command,
                executableSha256=self.text(row.get("executableSha256"),64),start=self.text(row.get("observedStart"),128),
                startObserved=type(row.get("observedStart"))is str and len(row["observedStart"])<=128,fullFingerprint=None,
                waited=row.get("terminal") is True,status=self.number(status,-2147483648,2147483647),
                stdoutComplete=row.get("stdoutComplete") is True,stderrComplete=row.get("stderrComplete") is True,
                partialStdoutAvailable=row.get("partialStdoutAvailable") is True,partialStderrAvailable=row.get("partialStderrAvailable") is True,
                classification=self.text(row.get("classification"),64),ownership="PROVISIONAL_UNQUALIFIED"))
        client=dict(pid=self.number(self.pid,1,2147483647),ppid=self.number(self.ppid,0,2147483647),start=None,argvHash=None,fullFingerprint=None)
        if type(current)is dict:
            client.update(pid=self.number(current.get("pid"),1,2147483647),ppid=self.number(current.get("ppid"),0,2147483647),start=self.text(current.get("start"),128),argvHash=self.text(current.get("argvHash"),64))
            if current.get("identityComplete") is True:client["fullFingerprint"]={key:self.text(current["physicalProcessFingerprint"][key],64) for key in ("commHash","executableHash","executableFileHash")}
        resources=self.resources
        unresolved=sum(len(getattr(c,"chain",[]))+len(getattr(c,"leaves",[])) for c in resources)
        value=dict(kind="FAILED_RESOURCE_PROVISIONAL_OWNERSHIP",sink="ROOT_OPERATOR_TOOL_TRACE",status="HOLD",
            errorType=self.primary_type,qualified=False,NFact=False,credit=False,
            qualificationReached=prequalified,client=client,children=known,
            priorQualifiedUtilityRecordCount=len(utilities)-len(selected),
            unresolvedDescriptorCount=unresolved+len(self.bootstrap_fds),
            descriptorCompletion="UNKNOWN" if unresolved or self.bootstrap_fds else "CLOSED",
            childCompletion="UNKNOWN" if any(not r["waited"] for r in known) else "KNOWN_WAIT_RESULTS_ONLY",
            historicalRepair=False,outerObserverCompletionOwed=True,boundedMetadataOmitted=self.bounded_metadata_omitted,primaryFailure=self.primary_failure,cleanupFailures=self.cleanup_failures,stageDescribesFutureOnly=True,oldFirstHoldReason="UNKNOWN_NOT_RETROACTIVELY_ESTABLISHED",descriptorSnapshotIsPostExitLeakProof=False,finalizationOwner=self.finalizer_label,namespaceCreation=self.namespace_state,selfText=getattr(owner,"provisional_self_text",None) if owner is not None else None)
        if len(json.dumps(value,ensure_ascii=True,separators=(",",":"),allow_nan=False).encode())>8388608:raise BootstrapValueError("FAILURE_SINK_BYTES_BOUND")
        self.emit(value)
def require(ok):
 if not ok:raise BootstrapValueError("FAILED_BOOTSTRAP_INTEGRITY")
sink=FailureSink(lambda value:print(json.dumps(value,sort_keys=True,separators=(",",":"),allow_nan=False),flush=True),os.getpid(),os.getppid())
finalizer=sink.claim_finalizer("GUARD")
status=1;failure=None;mode=None;fds=[];chain=[]
key=lambda x:(x.st_dev,x.st_ino,x.st_mode,x.st_uid)
def own(fd):fds.append(fd);sink.bootstrap_fds.append(fd)
try:
 path,expected,mode,authority,control,completion_sha,completion_buffer=sys.argv[1:]
 require(type(completion_buffer)is str and len(completion_buffer)<=65536)
 completion_raw=completion_buffer.encode("utf-8","strict")
 require(len(completion_raw)<=65536 and hashlib.sha256(completion_raw).hexdigest()==completion_sha)
 fd=os.open("/",os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW);own(fd);chain.append((None,"/",fd,key(os.fstat(fd))))
 for name in path.split("/")[1:-1]:
  parent=fd;fd=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=parent);own(fd);chain.append((parent,name,fd,key(os.fstat(fd))))
 parent=fd;fd=os.open(path.rsplit("/",1)[1],os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent);own(fd);before=os.fstat(fd)
 require(stat.S_ISREG(before.st_mode) and stat.S_IMODE(before.st_mode)==0o600 and before.st_uid==os.getuid() and before.st_nlink==1 and 0<=before.st_size<=1048576)
 raw=b"";left=before.st_size
 while left:
  piece=os.read(fd,min(left,65536));require(type(piece)is bytes and 0<len(piece)<=min(left,65536));raw+=piece;left-=len(piece)
 after=os.fstat(fd);named=os.stat(path.rsplit("/",1)[1],dir_fd=parent,follow_symlinks=False)
 require(key(before)+(before.st_size,before.st_mtime_ns,before.st_ctime_ns)==key(after)+(after.st_size,after.st_mtime_ns,after.st_ctime_ns)==key(named)+(named.st_size,named.st_mtime_ns,named.st_ctime_ns))
 for p,name,handle,want in chain:
  named=os.stat(name,follow_symlinks=False) if p is None else os.stat(name,dir_fd=p,follow_symlinks=False)
  require(key(os.fstat(handle))==want==key(named))
 require(hashlib.sha256(raw).hexdigest()==expected)
 ns={"__name__":"_externally_verified_failed_entry","BootstrapValueError":BootstrapValueError};exec(compile(raw,path,"exec"),ns)
 status=ns["execute"](mode,authority,control,failure_sink=sink,completion_raw=completion_raw,completion_sha=completion_sha)
except BaseException as error:
 failure=error;sink.primary(error);status=1
finally:
 for fd in reversed(fds):
  try:os.close(fd);sink.bootstrap_fds.remove(fd)
  except BaseException as error:
   sink.cleanup(error)
   if failure is None:failure=error;sink.primary(error,"CLOSE_ACCOUNTING")
   status=1
 if failure is not None:sink.primary(failure)
 final_status=sink.finalize(finalizer)
 if mode=="gate":status=final_status if type(final_status)is int and final_status==0 else 1
 elif type(status)is not int or status not in(0,1):status=1
sys.exit(status)
' "$GATEWAY_FR04_ENTRY" "$GATEWAY_FR04_ENTRY_SHA" "$1" "$GATEWAY_FR04_ROOT_SHA" "${@:2}" < /dev/null
}
readonly -f gateway80_failed_red04_invoke
gateway80_failed_red04_exit() {
  [[ "$1" == '1' && ( "$#" == 1 || "$#" == 4 ) ]] || return 1
  if [[ "$#" == 1 ]]; then
    gateway80_failed_red04_invoke negative
    return 1
  fi
  [[ "$2" =~ ^[0-9a-f]{64}$ ]] || return 1
  if gateway80_failed_red04_invoke gate "$2" "$3" "$4"; then
    builtin exit 1
  fi
  return 1
}
readonly -f gateway80_failed_red04_exit

gateway80_fr04_bind_setup_sha() {
  [[ "$#" == 3 && "$1" =~ ^[0-9a-f]{64}$ && "$2" =~ ^[0-9a-f]{64}$ && -z "${GATEWAY_FR04_SETUP_SHA-}" ]] || return 1
  readonly GATEWAY_FR04_SETUP_SHA="$1"
  readonly GATEWAY_FR04_SETUP_COMPLETION_SHA="$2"
  readonly GATEWAY_FR04_SETUP_COMPLETION_BUFFER="$3"
}
readonly -f gateway80_fr04_bind_setup_sha
