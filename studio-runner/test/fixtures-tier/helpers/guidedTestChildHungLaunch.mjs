// The guided child whose browser launch never returns (guidedCloseBound F4: a stop before the browser is spawned).
import { runTestChild } from './guidedTestChildCore.mjs';
runTestChild({ hangLaunch: true });
