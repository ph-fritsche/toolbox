import { ModuleLoader } from '#src/loader/ModuleLoader'
import { setupFilesystemMock } from '#test/_fsMock'

test('transform TS files to JS', async () => {
    const loader = new ModuleLoader(setupFilesystemMock({
        '/project/some/file.ts': `
            const x: string = 'y'
        `,
    }), '/project', {resolve: s => s}, () => undefined)

    await expect(loader.load('some/file.ts')).resolves.toEqual({
        content: expect.stringContaining(`const x = 'y';`),
        mimeType: 'text/javascript',
    })
})

test('replace import sources', async () => {
    const resolve = mock.fn(s => s === 'a' ? 'foo': 'bar')
    const loader = new ModuleLoader(setupFilesystemMock({
        '/project/some/file.js': `
            import 'a';
            import 'b';
        `,
    }), '/project', {resolve}, () => undefined)

    const result = await loader.load('some/file.js')
    expect(resolve).toHaveBeenNthCalledWith(1, 'a', new URL('file:///project/some/file.js'))
    expect(resolve).toHaveBeenNthCalledWith(2, 'b', new URL('file:///project/some/file.js'))
    expect(result?.content).toMatch('import "foo";')
    expect(result?.content).toMatch('import "bar";')
})

test('instrument code', async () => {
    const covVarGetter = mock.fn(() => '-COVERAGE-')
    const loader = new ModuleLoader(setupFilesystemMock({
        '/project/some/file.js': `
            const x = 'y'
        `,
    }), '/project', {resolve: s => s}, covVarGetter)

    const result = await loader.load('some/file.js')
    expect(result?.content).toMatch('var gcv = "-COVERAGE-";')
    expect(result?.content).toMatch(/const x = \(cov_\d+\(\)\.s\[0\]\+\+, 'y'\);/)
})

test('inline sourcemap', async () => {
    const loader = new ModuleLoader(setupFilesystemMock({
        '/project/some/file.js': `
            const x = 'y'
        `,
    }), '/project', {resolve: s => s}, () => undefined)

    const result = await loader.load('some/file.js')
    expect(result?.content).toMatch('//# sourceMappingURL=data:application/json;base64,')

    const map = String(result?.content).match(/\/\/# sourceMappingURL=data:application\/json;base64,([a-zA-Z0-9=+/]+)/)?.[1]
    expect(map).toEqual(expect.any(String))
    expect(JSON.parse(Buffer.from(map as string, 'base64').toString('utf8'))).toEqual({
        version: 3,
        mappings: 'AACY,MAAMA,IAAI',
        names: ['x'],
        sources: ['/project/some/file.js'],
        sourcesContent: [`
            const x = 'y'
        `],
    })
})
