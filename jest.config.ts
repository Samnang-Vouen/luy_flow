import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

// Path aliases (e.g. the ones added by `nest g library`) live in tsconfig.json,
// so they are read from there instead of being duplicated here.
const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

// NestJS 12 ships as ES modules only, so Jest runs in ESM mode
// (see the `test` scripts, which pass --experimental-vm-modules).
// In spec files, import `jest` from '@jest/globals'; it is not a global in ESM mode.
const tsJestTransform: Config['transform'] = {
  '^.+\\.ts$': [
    'ts-jest',
    {
      useESM: true,
      tsconfig: {
        // TypeScript 6 requires rootDir when files outside src/ are compiled.
        rootDir: '.',
        module: 'esnext',
        moduleResolution: 'bundler',
      },
    },
  ],
};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  transform: tsJestTransform,
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
  moduleNameMapper: pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    'apps/**/*.(t|j)s',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

export default config;
