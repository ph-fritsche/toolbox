import { ModuleLoader, ModuleTransformer } from '#src/loader/ModuleLoader'
import swc from '@swc/core'
import {Visitor} from '@swc/core/Visitor.js'

function setupModuleLoader(
    files: Record<string, string>,
    resolve: (s: string) => string = s => s,
    getCovVar: (s: string) => string|undefined = () => undefined,
    transformers: ModuleTransformer[] = [],
) {
    return new ModuleLoader(
        async (sourcePath) => {
            if (!files[sourcePath]) {
                throw undefined
            }
            return files[sourcePath]
        },
        '/project',
        {resolve},
        getCovVar,
        transformers,
    )
}

test('transform TS files to JS', async () => {
    const loader = setupModuleLoader({
        '/project/some/file.ts': `
            const x: string = 'y'
        `,
        '/project/some/file.tsx': `
            const x: React.ReactNode = <>foo</>
        `,
    })

    await expect(loader.load('some/file.ts')).resolves.toEqual({
        content: expect.stringContaining(`const x = 'y';`),
        mimeType: 'text/javascript',
    })
    await expect(loader.load('some/file.tsx')).resolves.toEqual({
        content: expect.stringContaining(`const x = /*#__PURE__*/ React.createElement(React.Fragment, null, "foo");`),
        mimeType: 'text/javascript',
    })
})

test('replace import sources', async () => {
    const resolve = mock.fn(s => s === 'a' ? 'foo': 'bar')
    const loader = setupModuleLoader({
        '/project/some/file.js': `
            import 'a';
            import z from 'b';
            import * as y from 'c';
            import {w as D, x} from 'd'
            console.log(w, x, y, z);
        `,
    }, resolve)

    const result = await loader.load('some/file.js')
    expect(resolve).toHaveBeenNthCalledWith(1, 'a', new URL('file:///project/some/file.js'), [])
    expect(resolve).toHaveBeenNthCalledWith(2, 'b', new URL('file:///project/some/file.js'), ['default'])
    expect(resolve).toHaveBeenNthCalledWith(3, 'c', new URL('file:///project/some/file.js'), ['*'])
    expect(resolve).toHaveBeenNthCalledWith(4, 'd', new URL('file:///project/some/file.js'), ['w', 'x'])
    expect(result?.content).toMatch('import "foo";')
    expect(result?.content).toMatch('import z from "bar";')
    expect(result?.content).toMatch('import * as y from "bar";')
    expect(result?.content).toMatch('import { w as D, x } from "bar";')
})

test('instrument code', async () => {
    const covVarGetter = mock.fn(() => '-COVERAGE-')
    const loader = setupModuleLoader({
        '/project/some/file.js': `
            const x = 'y'
        `,
    }, undefined, covVarGetter)

    const result = await loader.load('some/file.js')
    expect(result?.content).toMatch('var path = "/project/some/file.js";')
    expect(result?.content).toMatch('var gcv = "-COVERAGE-";')
    expect(result?.content).toMatch(/const x = \(cov_\d+\(\)\.s\[0\]\+\+, 'y'\);/)
})

test('inline sourcemap', async () => {
    const loader = setupModuleLoader({
        '/project/some/file.js': `
            const x = 'y'
        `,
    })

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

test('inject transformers', async () => {
    const tranformA = mock.fn((module: swc.Module) => {
        return (new class V extends Visitor {
            visitStringLiteral(n: swc.StringLiteral): swc.StringLiteral {
                return {...n, value: 'y', raw: "'y'"}
            }
        }).visitModule(module)
    })
    const tranformB = mock.fn((module: swc.Module) => {
        return (new class V extends Visitor {
            visitIdentifier(n: swc.Identifier): swc.Identifier {
                return {...n, value: 'x'}
            }
        }).visitModule(module)
    })
    const loader = setupModuleLoader({
        '/project/some/file.js': `const a = 'b'`,
    }, undefined, undefined, [
        {transform: tranformA},
        {transform: tranformB},
    ])

    expect((await loader.load('some/file.js'))?.content).toMatch(`const x = 'y';`)
    expect(tranformA).toBeCalledWith(expect.any(Object), '/project/some/file.js', 'javascript')
    expect(tranformB).toBeCalledWith(expect.any(Object), '/project/some/file.js', 'javascript')
})
