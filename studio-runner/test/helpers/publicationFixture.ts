import {readFileSync} from 'node:fs';
import {parseDocumentJson} from './documentJson.js';
import type {AdmissionRequest,AdmissionReceipt,Artifact3,BuildIdentity,Execute3,Launch3,ObservedJob,TrustedPolicy,ValidationBasis,ValidationRequest,ValidationVerdict} from '../../src/executor/observedOperations.js';
import type {ObservedHashes} from '../../src/validator/observedReplay.js';
type Keys<T> = T extends unknown ? keyof T : never;
type Field<T,K extends PropertyKey> = T extends unknown ? K extends keyof T ? T[K] : never : never;
/** Mutable document types support intentional bad lexemes in adversarial test copies.
 * Union-only fields remain optional. Actual acceptance always goes through runtime validators. */
export type TestDocument<T> = DocumentValue<NonNullable<T>> | Extract<T,null|undefined>;
type DocumentValue<T> = [T] extends [readonly (infer U)[]] ? TestDocument<U>[] : [T] extends [object] ?
  {-readonly [K in keyof T]:TestDocument<Field<T,K>>} & {-readonly [K in Exclude<Keys<T>,keyof T>]?:TestDocument<Field<T,K>>} :
  [T] extends [string] ? string : [T] extends [number] ? number : [T] extends [boolean] ? boolean : T;
interface ReferenceDocument {basis:ValidationBasis;artifact:Artifact3;hashes:ObservedHashes}
export interface PublicationDocument {controlValueReference?:ReferenceDocument;controlValueReferenceUsedConfiguration?:ReferenceDocument;basis:ValidationBasis;artifact:Artifact3;hashes:ObservedHashes;build:BuildIdentity;job:ObservedJob;launch:Launch3;execute:Execute3;trustedPolicy:TrustedPolicy;validationRequest:ValidationRequest;admissionRequest:AdmissionRequest;admissionReceipt:AdmissionReceipt;examples:{ValidationVerdict:{value:ValidationVerdict}};observedChoice:{basis:ValidationBasis;artifact:Artifact3;hashes:ObservedHashes}}
export const publicationFixture=parseDocumentJson(readFileSync(new URL('../../../docs/specs/studio-observed-authoring/contracts/v3/publication-fixtures.json',import.meta.url)),33554432) as TestDocument<PublicationDocument>;
