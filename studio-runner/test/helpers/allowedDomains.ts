/**
 * The navigation whitelist every test runner and test browser runs with. The live fixture servers
 * answer on `localhost` (never an IP literal, which can no longer be an entry); the sealed contract
 * fixtures name `https://orders.example.test`. Two entries, neither a sub-domain of the other.
 */
export const TEST_DOMAINS: readonly string[] = ['localhost', 'example.test'];

/** The origin the sealed publication/replay fixtures run on; it falls under `example.test`. */
export const FIXTURE_ORIGIN = 'https://orders.example.test';

/** The entry the live fixture pages fall under; their read grant is `readGrantId(LOCAL_DOMAIN)`. */
export const LOCAL_DOMAIN = 'localhost';
