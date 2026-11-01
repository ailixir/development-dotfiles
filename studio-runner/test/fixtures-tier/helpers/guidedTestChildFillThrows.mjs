// The guided child whose secret hook throws the released value in every encoding the leak oracle looks for (secret-login, injected-released-value).
import { Buffer } from 'node:buffer';
import { runTestChild } from './guidedTestChildCore.mjs';
runTestChild({
  beforeSecretFill: (value) => { throw new Error(`${value} ${encodeURIComponent(value)} ${Buffer.from(value).toString('base64')} ${'\u{1F642}'.repeat(2000)}`); },
});
