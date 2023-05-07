export default {
    verbose: true,
    collectCoverage: true,
    collectCoverageFrom: [
        'src/**/*.{js,jsx,ts,tsx}',
    ],
    coveragePathIgnorePatterns: [
        '\\.d\\.ts$',
    ],
    coverageProvider: 'v8',
    testMatch: [
        '<rootDir>/test/**/*.{js,jsx,ts,tsx}',
    ],
    testPathIgnorePatterns: [
        '/_.*(?<!\\.test\\.[jt]sx?)$',
        '\\.d\\.ts$',
    ],
    transform: {
        '^.+\\.(t|j)sx?$': [
            '@swc/jest',
            {
                jsc: {
                    paths: {
                        '#src': ['./src'],
                        '#src/*': ['./src/*'],
                    },
                    target: 'es2021',
                },
            },
        ],
    },
    extensionsToTreatAsEsm: ['.ts'],
    transformIgnorePatterns: [
    ],
    setupFilesAfterEnv: [
        '<rootDir>/jest.setup.js',
    ],
}
