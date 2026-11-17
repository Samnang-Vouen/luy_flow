import { jest } from '@jest/globals';

// In ESM mode Jest injects describe/it/expect but not the `jest` object.
// Specs written against the global from @types/jest (jest.fn(), jest.Mock) expect it,
// so expose it here. Importing it from '@jest/globals' in a spec still works too.
Object.assign(globalThis, { jest });
