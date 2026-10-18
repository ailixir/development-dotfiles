import {createRequire} from 'node:module';
import {deepStrictEqual,strictEqual} from 'node:assert';
import {hashObserved} from '../../src/validator/observedReferencePolicy.js';
export type NegativeSection='snapshot'|'graph'|'incrementalBasis';
export interface NegativeCase {name:string;basis:unknown;authority:unknown;expectedArtifact?:unknown;expected?:string}
export interface NegativeBoundary {
  name:string;section:NegativeSection;parent:string;
  route:'OFFERED_CANDIDATE_REQUEST_VALIDATION'|'PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY'|'PUBLIC_MINIMUM_ADMITTED_GRAPH_JOIN_PLUS_EXTERNAL_EXACT_HISTORY';
  mutations:readonly {pointer:string;remove:boolean;oldHash:string|null;newHash:string|null}[];
  requiredBackendCompanion:string;backendObligationIndices0?:readonly number[];actualBackendCompanionSourceGap?:string;actualBackendStatus:'UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE';
}
// Permanent test-only mapping of exact immutable canonical deltas. No QA artifact is loaded.
// These declarations are synthetic fixture authority, never JWT/mTLS/DB/live-owner evidence.
export const SYNTHETIC_AUTHORITY_SCOPE='SYNTHETIC_DECLARED_FACTS_ONLY_NO_DB_JWT_MTLS_OR_LIVE_OWNER_PROOF';
export const negativeBoundaries:readonly NegativeBoundary[]=[
  {
    "name": "immutable-original-source-cannot-be-replaced",
    "section": "snapshot",
    "parent": "boundary",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/basis/snapshotEvidence/current/authoring/steps/2/context/entries/1/value",
        "remove": false,
        "oldHash": "ccdb0b49bc67c483dc99395adddca5e9bb4d9c3273c32ddd4d5537ab223f2353",
        "newHash": "38749db0c632170c0499a669220f2491dce0bfd4ac3b2b3c5f8ec9c3cf5f17e9"
      }
    ],
    "requiredBackendCompanion": "Backend real source manifest/read/builder plus original source/config CAS; obligation60.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      60
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertIncrementalImmutableSourceAndPlanHistory + GuidedPublicationEvidenceRepository.snapshotEvidence: actual immutable-source/read/builder resealed evidence and original source/config CAS companion remains required."
  },
  {
    "name": "private-plain-hash-must-match-before-freeze",
    "section": "snapshot",
    "parent": "boundary",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/sourceManifest/configurationValues/saved-label",
        "remove": false,
        "oldHash": "12ae32cb1ec02d01eda3581b127c1fee3b0dc53572ed6baf239721a03d82e126",
        "newHash": "ba3707acff4f5f4379e21d6484fbd4f61233512f60fda9145fddfbe195bca594"
      }
    ],
    "requiredBackendCompanion": "Backend GuidedPublicationEvidenceRepository.snapshotEvidence must hash actual private immutable value before removal;52/60/68.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      52,
      60,
      68
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertIncrementalImmutableSourceAndPlanHistory + GuidedPublicationEvidenceRepository.snapshotEvidence: actual immutable-source/read/builder resealed evidence and original source/config CAS companion remains required."
  },
  {
    "name": "immutable-source-manifest-hash-is-exact",
    "section": "snapshot",
    "parent": "boundary",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/basis/sourceManifestHash",
        "remove": false,
        "oldHash": "3169bd0cda726dae583e36125fea9245c9eece1251b23e6d01dbe853b5616479",
        "newHash": "cf863090129c1e00c180d5f60daa8599e2497f32d5e726104ac4ec5f68b4a14e"
      }
    ],
    "requiredBackendCompanion": "Backend start base/sourceManifest join exact hash including authoringSnapshot minus configurationValues;60.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      60
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertIncrementalImmutableSourceAndPlanHistory + GuidedPublicationEvidenceRepository.snapshotEvidence: actual immutable-source/read/builder resealed evidence and original source/config CAS companion remains required."
  },
  {
    "name": "candidate-snapshot-map-cannot-be-copied-even-if-resealed",
    "section": "snapshot",
    "parent": "boundary",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/learnedPlan/stepSnapshotHashes/00000000-0000-4000-8000-000000000001",
        "remove": false,
        "oldHash": "a3dddc6a7ce66e905b9a60dfd485dcdba36f0ff121f78356a22f9018169294d3",
        "newHash": "cf863090129c1e00c180d5f60daa8599e2497f32d5e726104ac4ec5f68b4a14e"
      },
      {
        "pointer": "/expectedArtifact/learnedPlanHash",
        "remove": false,
        "oldHash": "3e5aa3a22de2cc8675dd785697c248d2a64960bae7eac3068b2e63ff99b999c3",
        "newHash": "7f2e6044b96410860b9713285a89d33549842d9fa26e627b1b3808a9c377abd8"
      },
      {
        "pointer": "/expectedArtifact/replayPolicy/learnedPlanHash",
        "remove": false,
        "oldHash": "3e5aa3a22de2cc8675dd785697c248d2a64960bae7eac3068b2e63ff99b999c3",
        "newHash": "7f2e6044b96410860b9713285a89d33549842d9fa26e627b1b3808a9c377abd8"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "candidate-gap-in-reused-prefix",
    "section": "snapshot",
    "parent": "boundary",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/learnedPlan/reusedFrom/00000000-0000-4000-8000-000000000001",
        "remove": true,
        "oldHash": "24bc945f263bcafbc0e22b2ca2a0b80781786fb05e68687dda7e3ad78b9d3575",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "candidate-older-same-test-revision-id",
    "section": "snapshot",
    "parent": "boundary",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/learnedPlan/reusedFrom/00000000-0000-4000-8000-000000000001/revisionId",
        "remove": false,
        "oldHash": "1171657b673849751c1fd1c5cc470d491e7530a8ecdd7135f479f00cf49293cc",
        "newHash": "5de73b4afa1940d5171b993ea28f17aee972e8e8e10a510ced8298f4d011644c"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "candidate-suffix-reuse-is-forbidden",
    "section": "snapshot",
    "parent": "boundary",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/learnedPlan/reusedFrom/00000000-0000-4000-8000-000000000003",
        "remove": false,
        "oldHash": null,
        "newHash": "fe65e97b9ad789facd19d98739d75fc003218edaa24104a331ddabf95c170af5"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "raw-edge-cannot-name-pending-action",
    "section": "graph",
    "parent": "admitted-binding-replacement",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/ledgers",
        "remove": false,
        "oldHash": "749ee4e8ed463bb695cf7e952303fa36f9a720b47794800cd32068500954f311",
        "newHash": "5671971f3ea8a2b2b353f2a20bae3998e0c831a6fafd3cc0f99d1ec703be1d74"
      }
    ],
    "requiredBackendCompanion": "Backend actual repository action/admission snapshot must reject inconsistent/omitted pending facts;31/54/75. Pure offered artifact comparison is not this authority check.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      31,
      54,
      75
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertIncrementalImmutableSourceAndPlanHistory + GuidedPublicationEvidenceRepository action inventory: actual complete immutable ledgers versus omitted/pending supplied facts companion remains required."
  },
  {
    "name": "raw-allocation-cannot-be-replaced-with-effective-empty-copy",
    "section": "graph",
    "parent": "admitted-binding-replacement",
    "route": "PUBLIC_MINIMUM_ADMITTED_GRAPH_JOIN_PLUS_EXTERNAL_EXACT_HISTORY",
    "mutations": [
      {
        "pointer": "/basis/bootstrap/allocationHash",
        "remove": false,
        "oldHash": "fdad8b31a42fb523f682cc13d41f467ac708e994e8b81bc0409536a3f078230f",
        "newHash": "5603008fbfa122616a51c857ce5b45aac638db41261864cbf028743e3362350d"
      },
      {
        "pointer": "/basis/allocations/0/consumers",
        "remove": false,
        "oldHash": "4f1b5649704328aadf69057bc0914f9bc2b84e34b0356d9e4e2578affc8f1c5d",
        "newHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
      }
    ],
    "requiredBackendCompanion": "Require that raw allocation includes the exact admitted excluded binding consumer (stepId,slot) witnessed by its proposal/edge, before projecting it away; retain the original self-resealed allocationHash mutant and reject without trusting sidecars.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "raw-failed-edge-history-cannot-be-erased",
    "section": "graph",
    "parent": "admitted-binding-replacement",
    "route": "PUBLIC_MINIMUM_ADMITTED_GRAPH_JOIN_PLUS_EXTERNAL_EXACT_HISTORY",
    "mutations": [
      {
        "pointer": "/basis/consumerEdges",
        "remove": false,
        "oldHash": "e1c6a89eefbaf56406d8e91b819dbf7f57fb7ba8c762c14435ff024b04039855",
        "newHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
      }
    ],
    "requiredBackendCompanion": "Require exactly one raw consumer edge for the exact admitted excluded binding proposal/producer/admission/coordinate/slot; a no-native outcome does not erase the admitted edge. Keep original deletion mutation; reject without trusting rawGraph sidecar.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "receipt-transport-authority-cannot-be-inferred-from-hash",
    "section": "graph",
    "parent": "admitted-binding-replacement",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/authenticatedReceipt",
        "remove": false,
        "oldHash": "56bac6e5433f92ff8fce8c834c3d269e8d3d862e3a879817cdf886795323ab2d",
        "newHash": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b"
      }
    ],
    "requiredBackendCompanion": "Actual signed owning-worker HTTP callback plus assignment/current owner checks;48/54.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      48,
      54
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertActualDriftCallbackAuthorityThenRelease (drift-auth/drift-auth-pre): exact original owning-worker token/mTLS/assignment/current-owner/fence mutation must execute through actual authenticated HTTP+PG+runner seam; no synthetic credit."
  },
  {
    "name": "candidate-policy-cannot-omit-successful-transfer",
    "section": "graph",
    "parent": "same-pair",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/replayPolicy/transfers",
        "remove": false,
        "oldHash": "4cd0a5a4e3e4c92ecd127a2ab1815cf75a00a32d44156090905c12ac803bc314",
        "newHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "candidate-policy-binding-cannot-drop-successful-consumer",
    "section": "graph",
    "parent": "same-pair",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/replayPolicy/bindings/0/consumers",
        "remove": false,
        "oldHash": "12409babaad0a709e9fb6af97bbfe0d4dab0d14ea410836ae0ee6d0ea2cb393a",
        "newHash": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "publication-preimage-must-commit-raw-failed-edge",
    "section": "graph",
    "parent": "admitted-binding-replacement",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/replayPolicy/publicationEvidenceHash",
        "remove": false,
        "oldHash": "7500a8cceb2953574f29bc7920463462e207386a66ad349ce03545a114d70e1a",
        "newHash": "644c2163d21337cd07049d035eaeb451c8223143ae0c251be4db418992a24c03"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "publication-preimage-envelope-cannot-change",
    "section": "graph",
    "parent": "admitted-binding-replacement",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/replayPolicy/publicationEvidenceHash",
        "remove": false,
        "oldHash": "7500a8cceb2953574f29bc7920463462e207386a66ad349ce03545a114d70e1a",
        "newHash": "2f7a155fd43698e8125bc76cc86c050ddeb1ebe070aacc3ebda3fb24bdcab9a9"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "admission-preimage-must-exclude-spent-attempt",
    "section": "graph",
    "parent": "admitted-binding-replacement",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/replayPolicy/admissionProvenanceHash",
        "remove": false,
        "oldHash": "dbb4823fd21c3ccdc9859a7c72704482efee4e8dec93c0ea2e0fbddfbcfac128",
        "newHash": "c3dfce5277587bf880f00d29b2525dbbd9a36ae31ba81d9b2770a86d6d4353c3"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "admission-preimage-is-array-not-wrapper",
    "section": "graph",
    "parent": "admitted-binding-replacement",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/replayPolicy/admissionProvenanceHash",
        "remove": false,
        "oldHash": "dbb4823fd21c3ccdc9859a7c72704482efee4e8dec93c0ea2e0fbddfbcfac128",
        "newHash": "bd2252c73ba66525c46177766d16fee769198ccc59637d8c40f0595a4b3c2b0f"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "candidate-authorization-preimage-is-exact",
    "section": "graph",
    "parent": "admitted-binding-replacement",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/replayPolicy/runAuthorizationHash",
        "remove": false,
        "oldHash": "311685f07d4c32e6647a3593d0727dfb90c595ebac541d01eb6b1fc1d14d8aa5",
        "newHash": "cf863090129c1e00c180d5f60daa8599e2497f32d5e726104ac4ec5f68b4a14e"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "candidate-source-identity-cannot-be-substituted",
    "section": "graph",
    "parent": "admitted-binding-replacement",
    "route": "OFFERED_CANDIDATE_REQUEST_VALIDATION",
    "mutations": [
      {
        "pointer": "/expectedArtifact/sourceHash",
        "remove": false,
        "oldHash": "63739a2597f3c6727f143eeaedb4f00b56e459b91f53a29637c27564f2cb0be7",
        "newHash": "cf863090129c1e00c180d5f60daa8599e2497f32d5e726104ac4ec5f68b4a14e"
      }
    ],
    "requiredBackendCompanion": "Validate coherent positive request first, pass exact mutated expectedArtifact into actual validateObservedRequest with recomputed genuine request basisHash/build/profile; assert ok:false/errorCode OPERATION_MISMATCH or applicable closed shape refusal. Java must compare independently derived full candidate and exercise production commit reject where the original tier requires it. Never assert a valid basis itself must throw.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE"
  },
  {
    "name": "wrong-private-input-hash",
    "section": "incrementalBasis",
    "parent": "ordinary",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/basis/materializationEvidence/entries/0/inputHash",
        "remove": false,
        "oldHash": "9f83a15e0c49c8133b6f28b26ed71801c1c45e2ddd6565bb25afeed34d2519e4",
        "newHash": "1aa8e8443881742e66fe8cd523a31bb4199c05a7bcfe27f89f3d48d20764ac49"
      },
      {
        "pointer": "/expectedArtifact",
        "remove": true,
        "oldHash": "023a74abb72c95a84f2a01e70c9bcc273ff2a8211807b520e10f787db0d35d3c",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Backend GuidedMaterializationEvidence actual value-bearing rows/hash reconstruction, no raw value leaked;52.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      52
    ],
    "actualBackendCompanionSourceGap": "IncrementalMaterializationEvidenceTest.reconstructsEveryPrivateHistoricalEnvelopeAndExportsOnlyMetadata + GuidedPublicationReplayIT.assertIncrementalAppendAckHistory: actual PG private value/hash tamper inventory remains required."
  },
  {
    "name": "preparation-substitutes-birth-for-actual",
    "section": "incrementalBasis",
    "parent": "appendedHistorical",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/basis/preparations/0/materializationRevision",
        "remove": false,
        "oldHash": "d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
        "newHash": "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b"
      },
      {
        "pointer": "/expectedArtifact",
        "remove": true,
        "oldHash": "5d01f5fd79e511c2bf22aadd13fb504b006e46e5e3af3808a061358d8182e9ce",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Backend actual preparation copied evidence/current historical version query compares exact issued materializationRevision;18/52/54/74.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      18,
      52,
      54,
      74
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertIncrementalAppendAckHistory + GuidedPublicationEvidenceRepository: exact persisted issued preparation revision versus historical birth revision and actual expiry/append race remain required."
  },
  {
    "name": "unrelated-failed-ledger-cannot-be-omitted",
    "section": "incrementalBasis",
    "parent": "ordinary",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/ledgers",
        "remove": false,
        "oldHash": "4cb66a1218704b4e65d67feb6ed6a7bfb9d83621aa2810858ee78eef53ab73b5",
        "newHash": "a54253f130a8c5fbbbadef5170547db1a10f8c969f731efce7392c8dacd023c7"
      },
      {
        "pointer": "/expectedArtifact",
        "remove": true,
        "oldHash": "023a74abb72c95a84f2a01e70c9bcc273ff2a8211807b520e10f787db0d35d3c",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Actual repository complete action inventory rejects other failed/unknown/dispatching omission;31/54.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      31,
      54
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertIncrementalImmutableSourceAndPlanHistory + GuidedPublicationEvidenceRepository action inventory: actual complete immutable ledgers versus omitted/pending supplied facts companion remains required."
  },
  {
    "name": "hash-is-not-transport-authentication",
    "section": "incrementalBasis",
    "parent": "admittedDrift",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/authenticatedReceipt",
        "remove": false,
        "oldHash": "eaf5480235ce4c3812cda1a41c4ee1b709cb3e0a1d7b382ab35a173a75812100",
        "newHash": "74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b"
      },
      {
        "pointer": "/expectedArtifact",
        "remove": true,
        "oldHash": "259aab6f643462694b03b5c3586acac0bb8bc69cfc5c3a2214ca680c15531c03",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Actual owning-worker callback refuses absent authentication despite correct receiptHash;48/54.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      48,
      54
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertActualDriftCallbackAuthorityThenRelease (drift-auth/drift-auth-pre): exact original owning-worker token/mTLS/assignment/current-owner/fence mutation must execute through actual authenticated HTTP+PG+runner seam; no synthetic credit."
  },
  {
    "name": "forged-jwt-algorithm",
    "section": "incrementalBasis",
    "parent": "admittedDrift",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/authenticatedReceipt/jwtAlgorithm",
        "remove": false,
        "oldHash": "edd9a9263bcd11892f0de53c856b33027b54fc485c78296d4f4b372cbfeed6be",
        "newHash": "30a0924a3360be687d1df9fcbbfdff62c01bc0fd14036ab9076cf7f451568666"
      },
      {
        "pointer": "/expectedArtifact",
        "remove": true,
        "oldHash": "259aab6f643462694b03b5c3586acac0bb8bc69cfc5c3a2214ca680c15531c03",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Real HTTP token verifier refuses forged algorithm; no model/caller trust;48/54.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      48,
      54
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertActualDriftCallbackAuthorityThenRelease (drift-auth/drift-auth-pre): exact original owning-worker token/mTLS/assignment/current-owner/fence mutation must execute through actual authenticated HTTP+PG+runner seam; no synthetic credit."
  },
  {
    "name": "missing-mtls",
    "section": "incrementalBasis",
    "parent": "admittedDrift",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/authenticatedReceipt/mtlsVerified",
        "remove": false,
        "oldHash": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
        "newHash": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa"
      },
      {
        "pointer": "/expectedArtifact",
        "remove": true,
        "oldHash": "259aab6f643462694b03b5c3586acac0bb8bc69cfc5c3a2214ca680c15531c03",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Actual HTTP connection without client certificate refuses;48/54.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      48,
      54
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertActualDriftCallbackAuthorityThenRelease (drift-auth/drift-auth-pre): exact original owning-worker token/mTLS/assignment/current-owner/fence mutation must execute through actual authenticated HTTP+PG+runner seam; no synthetic credit."
  },
  {
    "name": "wrong-worker-subject",
    "section": "incrementalBasis",
    "parent": "admittedDrift",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/authenticatedReceipt/subject",
        "remove": false,
        "oldHash": "e50fbe76491523bde76bfa56b0787f22343a91cede914adee72fef56e9ff11bd",
        "newHash": "130335a04c1ca3aecf00df034f1c1be9640c730d7a9a80b3ce57f98e11110dfa"
      },
      {
        "pointer": "/expectedArtifact",
        "remove": true,
        "oldHash": "259aab6f643462694b03b5c3586acac0bb8bc69cfc5c3a2214ca680c15531c03",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Actual authenticated wrong worker subject/assignment refuses;48/54.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      48,
      54
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertActualDriftCallbackAuthorityThenRelease (drift-auth/drift-auth-pre): exact original owning-worker token/mTLS/assignment/current-owner/fence mutation must execute through actual authenticated HTTP+PG+runner seam; no synthetic credit."
  },
  {
    "name": "stale-callback-owner",
    "section": "incrementalBasis",
    "parent": "admittedDrift",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/authenticatedReceipt/liveOwner",
        "remove": false,
        "oldHash": "b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b",
        "newHash": "fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa"
      },
      {
        "pointer": "/expectedArtifact",
        "remove": true,
        "oldHash": "259aab6f643462694b03b5c3586acac0bb8bc69cfc5c3a2214ca680c15531c03",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Actual owner transfer/loss or stale callback after terminal, with real HTTP current ownership check;48/54/81.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      48,
      54,
      81
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertActualDriftCallbackAuthorityThenRelease (drift-auth/drift-auth-pre): exact original owning-worker token/mTLS/assignment/current-owner/fence mutation must execute through actual authenticated HTTP+PG+runner seam; no synthetic credit."
  },
  {
    "name": "wrong-assignment",
    "section": "incrementalBasis",
    "parent": "admittedDrift",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/authenticatedReceipt/assignmentSessionId",
        "remove": false,
        "oldHash": "a3083c2052e51dc13f8a2048fd212e7f94b8b72d7fe9699193c37f0f30dcf0d3",
        "newHash": "1185c4adc62c749322cdd27b832b460baf5bf7173c836b433d806478b3d6ed78"
      },
      {
        "pointer": "/expectedArtifact",
        "remove": true,
        "oldHash": "259aab6f643462694b03b5c3586acac0bb8bc69cfc5c3a2214ca680c15531c03",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Actual callback worker/assignmentSessionId mismatch against persisted assignment, no writes;48/54.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      48,
      54
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertActualDriftCallbackAuthorityThenRelease (drift-auth/drift-auth-pre): exact original owning-worker token/mTLS/assignment/current-owner/fence mutation must execute through actual authenticated HTTP+PG+runner seam; no synthetic credit."
  },
  {
    "name": "wrong-owner-fence",
    "section": "incrementalBasis",
    "parent": "admittedDrift",
    "route": "PRIVATE_IMMUTABLE_OR_AUTHENTICATED_BACKEND_AUTHORITY",
    "mutations": [
      {
        "pointer": "/authority/authenticatedReceipt/ownerFence",
        "remove": false,
        "oldHash": "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
        "newHash": "d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35"
      },
      {
        "pointer": "/expectedArtifact",
        "remove": true,
        "oldHash": "259aab6f643462694b03b5c3586acac0bb8bc69cfc5c3a2214ca680c15531c03",
        "newHash": null
      }
    ],
    "requiredBackendCompanion": "Actual wrong authenticated X-Owner-Fence/current owner fence against stored assignment;48/54.",
    "actualBackendStatus": "UNFULFILLED_BY_SYNTHETIC_RUNNER_ORACLE",
    "backendObligationIndices0": [
      48,
      54
    ],
    "actualBackendCompanionSourceGap": "GuidedPublicationReplayIT.assertActualDriftCallbackAuthorityThenRelease (drift-auth/drift-auth-pre): exact original owning-worker token/mTLS/assignment/current-owner/fence mutation must execute through actual authenticated HTTP+PG+runner seam; no synthetic credit."
  }
];
interface SyntheticOracle {
  snapshotOracle:{validate(basis:unknown,authority:unknown,candidate?:unknown):unknown};
  validateExtendedBasis(basis:unknown,authority:unknown):void;
}
// Constant repository oracle, with no execution entry point called at module load.
const oracle=createRequire(import.meta.url)('../../../tools/check-studio-observed-contracts.cjs') as SyntheticOracle;
export function validateSyntheticDeclaredAuthority(row:NegativeCase,section:NegativeSection):void {
  if(section==='snapshot')oracle.snapshotOracle.validate(row.basis,row.authority,row.expectedArtifact);
  else oracle.validateExtendedBasis(row.basis,row.authority);
}
function record(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=='object')throw Error('MUTATION_POINTER_NOT_OBJECT');
  return value as Record<string,unknown>;
}
function pointer(root:unknown,path:string):{parent:Record<string,unknown>;key:string} {
  const parts=path.split('/').slice(1).map(part=>part.replaceAll('~1','/').replaceAll('~0','~'));
  const key=parts.pop();if(key===undefined)throw Error('MUTATION_POINTER_MISSING');
  let node=root;for(const part of parts)node=record(node)[part];return {parent:record(node),key};
}
/** Verify exact old/new bytes at each declared delta and equality everywhere else.
 * Never reseal, derive into, or otherwise repair the malicious offered document. */
export function assertExactNegativeMutation(parent:NegativeCase,row:NegativeCase,boundary:NegativeBoundary):void {
  const view=(item:NegativeCase)=>({basis:structuredClone(item.basis),authority:structuredClone(item.authority),...(item.expectedArtifact===undefined?{}:{expectedArtifact:structuredClone(item.expectedArtifact)})});
  const left=view(parent),right=view(row);
  strictEqual(row.name,boundary.name);strictEqual(parent.name,boundary.parent);
  for(const mutation of boundary.mutations){
    const old=pointer(left,mutation.pointer),next=pointer(right,mutation.pointer);
    strictEqual(Object.hasOwn(old.parent,old.key)?hashObserved(old.parent[old.key]):null,mutation.oldHash,mutation.pointer+' original preimage');
    strictEqual(Object.hasOwn(next.parent,next.key)?hashObserved(next.parent[next.key]):null,mutation.newHash,mutation.pointer+' malicious preimage');
    if(mutation.remove)strictEqual(Object.hasOwn(next.parent,next.key),false,mutation.pointer+' must remain deleted');
    Reflect.deleteProperty(old.parent,old.key);Reflect.deleteProperty(next.parent,next.key);
  }
  deepStrictEqual(right,left,'negative may change only its exact original declared deltas');
}
