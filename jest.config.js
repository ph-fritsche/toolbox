module.exports = {
    verbose: true,
    collectCoverage: true,
    collectCoverageFrom: [
        'src/**/*.{js,jsx,ts,tsx}',
    ],
    coveragePathIgnorePatterns: [],
    coverageProvider: 'v8',
    testMatch: [
        '<rootDir>/test/**/*.{js,jsx,ts,tsx}',
    ],
    testPathIgnorePatterns: [
        '/_.*(?<!.test.[jt]sx?)$',
    ],
    transform: {
        "^.+\\.(t|j)sx?$": [
            "@swc/jest",
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
    transformIgnorePatterns: [
    ],
}
