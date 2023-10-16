import { ErrorStackResolver } from '#src/conductor/ErrorStackResolver'
import { SourceMapGenerator } from 'source-map'

test('rewrite error stack', async () => {
    const sourceMap = new SourceMapGenerator({file: 'some/file.js', skipValidation: true})
    sourceMap.addMapping({
        source: 'some/file.ts',
        name: 'some/file.js',
        generated: {line: 5, column: 10},
        original: {line: 50, column: 60},
    })
    sourceMap.addMapping({
        source: 'some/file.ts',
        name: 'some/file.js',
        generated: {line: 20, column: 30},
        original: {line: 1, column: 2},
    })
    // A string with `//# sourceMappingURL=data:application/json` lets vitest fail with a SyntaxError
    const content0 = 'foo bar\n\n//# sourceMappingURL=data:'
    const content1 = 'application/json;charset=utf-8;base64,' + Buffer.from(String(sourceMap)).toString('base64')

    const resolver = new ErrorStackResolver([
        {
            origin: '/some/local/path',
            url: 'http://example.org/tests',
            getFile: async () => content0 + content1,
        },
    ])

    await expect(resolver.rewriteStack([
        `Error: some error`,
        `    at some.function (http://example.org/tests/some/file.js:5:10)`,
        `    at other.function (http://example.org/tests/some/file.js:20:30)`,
        `    at unmapped.function (http://example.org/tests/some/file.js:200:300)`,
        `    at unmapped.location (http://example.com/some/file.js:5:10)`,
        // TODO: guard against missing files / failing requests
        // `    at unmapped.file (http://example.org/tests/unmapped/file.js:200:300)`,
    ].join('\n'))).resolves.toBe([
        `Error: some error`,
        `    at some.function (/some/local/path/some/file.ts:50:60)`,
        `    at other.function (/some/local/path/some/file.ts:1:2)`,
        `    at unmapped.function (/some/local/path/some/file.js:200:300)`,
        `    at unmapped.location (http://example.com/some/file.js:5:10)`,
    ].join('\n'))
})
