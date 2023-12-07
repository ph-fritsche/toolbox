import { ImportResolverStack, ImportResolverConstrain, constrainResolver, createNodeBuiltinResolver, createNodeImportResolver, createToRelativeResolver, createTsResolver } from '#src/loader/ImportResolver'
import { TsConfigResolver, TsModuleResolver } from '#src/ts'
import { setupFilesystemMock } from '#test/_fsMock'
import { pathToFileURL } from 'url'

test('create import resolve chain', async () => {
    const a = mock.fn(() => 'foo')
    const b = mock.fn(async () => undefined)
    const c = mock.fn(() => 'bar')
    const importer = new URL('http://example.org/foo.js')
    const resolver = new ImportResolverStack([a, b, c])

    await expect(resolver.resolve('some/module', importer)).resolves.toBe('bar')
    expect(a).toBeCalledWith(undefined, 'some/module', importer)
    expect(b).toBeCalledWith('foo', 'some/module', importer)
    expect(c).toBeCalledWith('foo', 'some/module', importer)
})

test('constrain resolver', async () => {
    function resolve(
        importer: string,
        include?: RegExp[] | ImportResolverConstrain,
        exclude?: RegExp[] | ImportResolverConstrain,
        rootDirUrl = 'prot://host/workspace',
    ) {
        const callback = mock.fn(() => 'resolved-module')
        const importerUrl = new URL(importer)
        const result = constrainResolver(callback, include, exclude, rootDirUrl)('some', 'module', importerUrl)
        return {callback, importerUrl, include, exclude, result}
    }

    const inRootDir = resolve('prot://host/workspace/some/file.js', undefined, undefined)
    expect(inRootDir.callback).toBeCalledWith('some', 'module', inRootDir.importerUrl)
    expect(inRootDir.result).toBe('resolved-module')

    const notInRootDir = resolve('prot://host/different-workspace/some/file.js', undefined, undefined)
    expect(notInRootDir.callback).not.toBeCalled()
    expect(notInRootDir.result).toBe(undefined)

    const includeFuncPositive = resolve('prot://host/workspace/some/file.js', mock.fn(() => true), undefined)
    expect(includeFuncPositive.callback).toBeCalled()
    expect(includeFuncPositive.include).toBeCalledWith('some/file.js', includeFuncPositive.importerUrl)

    const includeFuncNegative = resolve('prot://host/workspace/some/file.js', mock.fn(() => false), undefined)
    expect(includeFuncNegative.callback).not.toBeCalled()
    expect(includeFuncNegative.include).toBeCalledWith('some/file.js', includeFuncPositive.importerUrl)

    const includeRegexpPositive = resolve('prot://host/workspace/some/file.js', [/never/, /some/], undefined)
    expect(includeRegexpPositive.callback).toBeCalled()

    const includeRegexpNegative = resolve('prot://host/workspace/some/file.js', [/never/, /other/], undefined)
    expect(includeRegexpNegative.callback).not.toBeCalled()

    const excludeFuncPositive = resolve('prot://host/workspace/some/file.js', undefined, mock.fn(() => true))
    expect(excludeFuncPositive.callback).not.toBeCalled()
    expect(excludeFuncPositive.exclude).toBeCalledWith('some/file.js', includeFuncPositive.importerUrl)

    const excludeFuncNegative = resolve('prot://host/workspace/some/file.js', undefined, mock.fn(() => false))
    expect(excludeFuncNegative.callback).toBeCalled()
    expect(excludeFuncNegative.exclude).toBeCalledWith('some/file.js', includeFuncPositive.importerUrl)

    const excludeRegexpPositive = resolve('prot://host/workspace/some/file.js', undefined, [/never/, /some/])
    expect(excludeRegexpPositive.callback).not.toBeCalled()

    const excludeRegexpNegative = resolve('prot://host/workspace/some/file.js', undefined, [/never/, /other/])
    expect(excludeRegexpNegative.callback).toBeCalled()
})

test('resolve per typescript', async () => {
    const fs = setupFilesystemMock({
        '/project/some/file.ts': '',
        '/project/other/file.ts': '',
        '/project/tsconfig.json': `{
            "compilerOptions": {
                "paths": {
                    "#foo": ["./other/file.ts"],
                },
            },
        }`,
    })
    const resolve = createTsResolver(new TsConfigResolver(fs), new TsModuleResolver(fs))

    expect(await resolve(undefined, '../other/file.ts', new URL('file:///project/some/file.ts'))).toBe('/project/other/file.ts')
    expect(await resolve(undefined, '../other/file', new URL('file:///project/some/file.ts'))).toBe('/project/other/file.ts')
    expect(await resolve(undefined, '#foo', new URL('file:///project/some/file.ts'))).toBe('/project/other/file.ts')

    expect(await resolve('already-resolved', '#foo', new URL('file:///project/some/file.ts'))).toBe(undefined)
    expect(await resolve(undefined, '#foo', new URL('unsupported:///project/some/file.ts'))).toBe(undefined)
})

test('resolve per node', async () => {
    const resolve = await createNodeImportResolver()

    const node_modules = process.cwd() + '/node_modules'

    expect(await resolve(undefined, 'typescript', pathToFileURL(node_modules + '/@swc/core/foo.js'))).toBe(String(pathToFileURL(node_modules + '/typescript/lib/typescript.js')))

    expect(await resolve('already-resolved', 'typescript', pathToFileURL(node_modules + '/@swc/core/foo.js'))).toBe(undefined)
})

test('convert to relative paths', async () => {
    const resolve = createToRelativeResolver()

    expect(resolve('./bar.js', '', new URL('prot://host/foo'))).toBe('./bar.js')

    expect(resolve('/workspace/bar.js', '', new URL('file:///workspace/foo.js'))).toBe('./bar.js')
    expect(resolve('/workspace/bar.js', '', new URL('file:///workspace/foo/baz.js'))).toBe('../bar.js')
    expect(resolve('file:///workspace/bar.js', '', new URL('file:///workspace/foo.js'))).toBe('./bar.js')
    expect(resolve('file:///workspace/bar.js', '', new URL('file:///workspace/foo/baz.js'))).toBe('../bar.js')

    expect(resolve('/workspace/bar.js', '', new URL('prot://host/foo'))).toBe(undefined)
    expect(resolve('prot://host/workspace/bar.js', '', new URL('prot://host/foo'))).toBe('./workspace/bar.js')
    expect(resolve('prot://user:pw@host/workspace/bar.js', '', new URL('prot://user:pw@host/foo'))).toBe('./workspace/bar.js')
    expect(resolve('prot://user2:pw@host/workspace/bar.js', '', new URL('prot://user:pw@host/foo'))).toBe(undefined)
    expect(resolve('prot://host/bar.js', '', new URL('prot://host/foo'))).toBe('./bar.js')
})

test('resolve node built-in modules', async () => {
    const resolve = createNodeBuiltinResolver({
        'process': 'some/module',
        'path': 'other/module',
    })
    expect(resolve(undefined, 'not a builtin module', new URL('prot://host/foo'))).toBe(undefined)
    expect(resolve(undefined, 'process', new URL('prot://host/foo'))).toBe('some/module')
    expect(resolve('path', 'original specifier', new URL('prot://host/foo'))).toBe('other/module')
    expect(() => resolve('url', '', new URL('prot://host/foo'))).toThrow('has no replacement')

    const resolveBuiltin = createNodeBuiltinResolver()
    expect(resolveBuiltin(undefined, 'not a builtin module', new URL('prot://host/foo'))).toBe(undefined)
    expect(resolveBuiltin(undefined, 'process', new URL('prot://host/foo'))).toBe('node:process')

    const onMissing = mock.fn(() => 'resolved-module')
    const resolveMissing = createNodeBuiltinResolver({}, onMissing)
    expect(resolveMissing(undefined, 'not a builtin module', new URL('prot://host/foo'))).toBe(undefined)
    expect(onMissing).not.toBeCalled()
    expect(resolveMissing(undefined, 'node:process', new URL('prot://host/foo'))).toBe('resolved-module')
    expect(onMissing).toBeCalledWith('process', new URL('prot://host/foo'))
})
