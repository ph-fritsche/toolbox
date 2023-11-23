import { TsModuleResolver } from '#src/ts'
import ts from 'typescript'
import { setupFilesystemMock } from './_helper'

test('resolve imports', () => {
    const fs = setupFilesystemMock({
        '/project/index.ts': ``,
        '/project/foo.js': ``,
        '/project/foo.d.ts': ``,
        '/project/bar.ts': ``,
        '/project/src/index.ts': ``,
        '/project/dependency/package.json': `{"main": "./main.js"}`,
        '/project/dependency/main.js': `export default 'foo'`,
        '/project/node_modules/dependency/package.json': `{"main": "./main.js", "types": "./main.d.ts"}`,
        '/project/node_modules/dependency/main.js': `export const foo = 'bar'`,
        '/project/node_modules/dependency/main.d.ts': `export const foo: string`,
    })
    const resolver = new TsModuleResolver(fs)
    const resolve = (
        name: string,
        moduleResolution: ts.ModuleResolutionKind,
        resolutionMode?: ts.ResolutionMode,
        resolveDts?: boolean,
    ) => resolver.resolveModule(
        name,
        '/project/index.ts',
        {
            moduleResolution,
            pathsBasePath: '/project',
            paths: {
                '#somePath': ['./src'],
            },
        },
        resolutionMode,
        resolveDts,
    )
    expect(resolve('./foo', ts.ModuleResolutionKind.Node10)).toBe('/project/foo.js')
    expect(resolve('./foo', ts.ModuleResolutionKind.Node10, undefined, true)).toBe('/project/foo.d.ts')
    expect(resolve('./foo', ts.ModuleResolutionKind.Node16)).toBe('/project/foo.js')
    expect(resolve('./foo', ts.ModuleResolutionKind.Node16, ts.ModuleKind.CommonJS)).toBe('/project/foo.js')
    expect(resolve('./foo', ts.ModuleResolutionKind.Node16, ts.ModuleKind.ESNext)).toBe(undefined)
    expect(resolve('./foo', ts.ModuleResolutionKind.Bundler, ts.ModuleKind.ESNext)).toBe('/project/foo.js')

    expect(resolve('./bar.js', ts.ModuleResolutionKind.Bundler)).toBe('/project/bar.ts')

    expect(resolve('./dependency', ts.ModuleResolutionKind.Bundler)).toBe('/project/dependency/main.js')
    expect(resolve('./dependency', ts.ModuleResolutionKind.Node16)).toBe('/project/dependency/main.js')

    expect(resolve('dependency', ts.ModuleResolutionKind.Node16)).toBe('/project/node_modules/dependency/main.js')
    expect(resolve('dependency', ts.ModuleResolutionKind.Node16, undefined, true)).toBe('/project/node_modules/dependency/main.d.ts')

    expect(resolve('#somePath', ts.ModuleResolutionKind.Bundler)).toBe('/project/src/index.ts')
    expect(resolver.resolveModule(
        '#somePath',
        '/project/index.ts',
        {
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            pathsBasePath: '/project',
            paths: {
                '#somePath': ['./bar.ts'],
            },
        },
    )).toBe('/project/bar.ts')
})
