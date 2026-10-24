"""Pure source model. Not a Darwin adapter or operational identity verifier."""

PROTOCOL = 'WAITED_NATIVE_WITH_SAMPLED_CLOSURE_V1'


def require(value, reason):
    if not value:
        raise ValueError(reason)


def evaluate_selector(evidence):
    """Show the missing relation explicitly; accept only a synthetic relation.

    The final relation is an abstract test input, never authority for execution.
    No production caller, filesystem operation or provider is implemented here.
    """
    require(type(evidence) is dict, 'MODEL_INPUT_TYPE')
    require(evidence.get('protocol') == PROTOCOL, 'MODEL_PROTOCOL')
    require(evidence.get('legacyOrdinaryGateSatisfied') is False, 'MODEL_LEGACY_FLAG')
    require(evidence.get('intervalCaptureClaimed') is False, 'MODEL_INTERVAL_FLAG')
    require(evidence.get('birth_stable') is True, 'MODEL_BIRTH_UNPROVED')
    require(evidence.get('mapped_equals_opened') is True, 'MODEL_MAPPED_FILE_UNPROVED')
    relation = evidence.get('main_object_relation')
    if type(relation) is not dict or relation.get('independent_object_relation') is not True:
        return 'MAIN_EXECUTABLE_OBJECT_RELATION_UNPROVED'
    require(relation.get('main_object') == evidence.get('mapped_object'), 'MODEL_MAIN_OBJECT_MISMATCH')
    require(relation.get('same_birth_bracket') is True, 'MODEL_RELATION_BIRTH_UNPROVED')
    return 'SYNTHETIC_MODEL_RELATION_ONLY_NO_OPERATIONAL_AUTHORITY'
