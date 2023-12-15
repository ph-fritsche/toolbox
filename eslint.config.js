import config from '@ph.fritsche/eslint-config'
import globals from 'globals'

export default [
    ...config.map(x => {
        if (x?.languageOptions?.parserOptions?.project) {
            x.languageOptions.parserOptions.project = ['./tsconfig.json', 'test/tsconfig.json', 'tests/tsconfig.json']
        }
        return x
    }),
    {
        files: ['**/*.ts'],
        rules: {
            'no-dupe-class-members': 0,
        },
    },
    {
        files: ['test/**'],
        rules: {
            '@typescript-eslint/no-non-null-assertion': 0,
            '@typescript-eslint/no-unsafe-argument': 0,
            '@typescript-eslint/no-unsafe-assignment': 0,
            '@typescript-eslint/no-unsafe-member-access': 0,
            '@typescript-eslint/no-unsafe-call': 0,
        },
    },
    {
        files: ['util/**'],
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        ignores: ['dependencies/**'],
    },
]
