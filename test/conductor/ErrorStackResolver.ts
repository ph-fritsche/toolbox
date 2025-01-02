import { ErrorStackResolver } from '#src/conductor/ErrorStackResolver'
import { SourceMapGenerator } from 'source-map'

test('rewrite error stack', async () => {
    const sourceMap = new SourceMapGenerator({file: 'some/file.js', skipValidation: true})
    sourceMap.addMapping({
        source: 'file:///some/local/path/some/file.ts',
        generated: {line: 5, column: 10},
        original: {line: 50, column: 60},
    })
    sourceMap.addMapping({
        source: 'file:///some/local/path/some/file.ts',
        name: 'original.function',
        generated: {line: 20, column: 30},
        original: {line: 1, column: 2},
    })

    const resolver = new ErrorStackResolver([
        {
            origin: '/some/local/path',
            url: 'http://example.org/tests',
            getFile: async () => 'foo bar\n\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,' + Buffer.from(String(sourceMap)).toString('base64'),
        },
    ])

    await expect(resolver.rewriteStack([
        `Error: some error`,
        `    at some.function (http://example.org/tests/some/file.js:5:10)`,
        `    at other.function (http://example.org/tests/some/file.js:20:30)`,
        `    at unmapped.function (http://example.org/tests/some/file.js:200:300)`,
        `    at unmapped.location (http://example.com/some/file.js:5:10)`,
        `    at unmapped.file (http://example.org/tests/unmapped/file.js:200:300)`,
    ].join('\n'))).resolves.toBe([
        `Error: some error`,
        `    at some.function (/some/local/path/some/file.ts:50:60)`,
        `    at original.function (/some/local/path/some/file.ts:1:2)`,
        `    at unmapped.function (/some/local/path/some/file.js:200:300)`,
        `    at unmapped.location (http://example.com/some/file.js:5:10)`,
        `    at unmapped.file (/some/local/path/unmapped/file.js:200:300)`,
    ].join('\n'))
})
