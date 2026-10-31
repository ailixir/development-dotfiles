// Fixture: the async function constructor, the construct only src/run/stepCode.ts may use.
type StepFunction = () => Promise<unknown>;
const AsyncFunction = (Object.getPrototypeOf(async function holder(): Promise<void> { /* constructor holder */ }) as { constructor: new (body: string) => StepFunction }).constructor;
export const build = (source: string): StepFunction => new AsyncFunction(source);
