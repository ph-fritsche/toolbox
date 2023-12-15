import { PackageConfigResolver } from '#src/loader/PackageConfigResolver'
import { setupFilesystemMock } from '#test/_fsMock'

test('get package config', () => {
    const fs = setupFilesystemMock({
        '/project/package.json': '{"type":"module"}',
        '/project/invalid.json': '{error}',
    })
    const resolver = new PackageConfigResolver(fs)

    expect(resolver.getConfig('/project/foo/bar/baz')).toEqual({type: 'module'})
    expect(fs.readFileSync).toBeCalledTimes(4)
    expect(fs.readFileSync).toHaveBeenNthCalledWith(1, '/project/foo/bar/baz/package.json')
    expect(fs.readFileSync).toHaveBeenNthCalledWith(2, '/project/foo/bar/package.json')
    expect(fs.readFileSync).toHaveBeenNthCalledWith(3, '/project/foo/package.json')
    expect(fs.readFileSync).toHaveBeenNthCalledWith(4, '/project/package.json')

    expect(() => resolver.getConfig('/project/foo', 'invalid.json')).toThrow('Invalid invalid.json at /project')

    expect(() => resolver.getConfig('/other/path')).toThrow('Could not find package.json for /other/path')
})

test('determine module type of .js files', () => {
    const fs = setupFilesystemMock({
        '/projectA/package.json': '{"type":"module"}',
        '/projectB/package.json': '{"type":"commonjs"}',
        '/projectC/package.json': '{}',
    })
    const resolver = new PackageConfigResolver(fs)

    expect(resolver.getJsModuleType('/projectA/foo.js')).toBe('ecmascript')
    expect(resolver.getJsModuleType('/projectB/foo.js')).toBe('commonjs')
    expect(resolver.getJsModuleType('/projectC/foo.js')).toBe('commonjs')
})
