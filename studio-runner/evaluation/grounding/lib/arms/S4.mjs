// SPK-07 arm S4: S3 plus a value-masked, Set-of-Marks screenshot (public sites only). Screening evidence only.
// Same observation, request, schema and interpretation as S3. The image goes in as an inlineData part after the text part, and
// the system instruction carries contracts/s4-addendum.md. The raw screenshot never leaves lib/visual.mjs.
import { makeArm } from './S3.mjs';

const arm = makeArm({ id: 'S4', visual: true });
export const id = arm.id;
export const observe = arm.observe;
export const buildRequest = arm.buildRequest;
export const interpret = arm.interpret;
