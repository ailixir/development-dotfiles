# Small reviewed argument wrapper; root separately verifies and inspects the readonly buffer.
gateway80_fr03_eval_reviewed_buffer() {
  [[ "$#" == 2 && "$1" =~ ^[0-9a-f]{64}$ && "$2" =~ ^[0-9a-f]{64}$ ]] || return 1
  [[ "${GATEWAY_FR03_BUFFER_VERIFY_STATUS-}" == 0 ]] || return 1
  eval "$GATEWAY_FR03_BINDING_BUFFER"
}
readonly -f gateway80_fr03_eval_reviewed_buffer
