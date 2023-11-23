import { TsConfigResolver } from '#src/ts'
import { setupFilesystemMock } from './_helper'

test('find closest config', () => {
    const fs = setupFilesystemMock({
        '/project/src/tsconfig.json': `{}`,
        '/project/tsconfig.json': `{}`,
    })
    const configResolver = new TsConfigResolver(fs)

    expect(configResolver.findConfig('/project')).toBe('/project/tsconfig.json')
    expect(configResolver.findConfig('/project/src')).toBe('/project/src/tsconfig.json')
    expect(configResolver.findConfig('/project/some/other/path')).toBe('/project/tsconfig.json')

    fs.existsSync.mockClear()
    expect(configResolver.findConfig('/project/some/other/path')).toBe('/project/tsconfig.json')
    expect(fs.existsSync).not.toBeCalled()
})

test('get parsed compilerOptions', () => {
    const fs = setupFilesystemMock({
        '/project/tsconfig.base.json': `{
            "compilerOptions": {
                "allowUnreachableCode": false,
                "allowUnusedLabels": false,
                "inlineSourceMap": true,
            },
        }`,
        '/project/tsconfig.json': `{
            "extends": ["./tsconfig.base.json"],
            "compilerOptions": {
                "allowUnreachableCode": true,
            },
        }`,
        '/project/extra/tsconfig.json': `{
            "extends": ["../tsconfig.base.json", "../tsconfig.json"],
            "compilerOptions": {
                "allowUnusedLabels": true,
            },
        }`,
        '/error/tsconfig.json': `{
            foo: 'bar',
        }`,
    })
    const configResolver = new TsConfigResolver(fs)

    expect(configResolver.getCompilerOptions('/project')).toEqual({
        configFilePath: '/project/tsconfig.json',
        allowUnreachableCode: true,
        allowUnusedLabels: false,
        inlineSourceMap: true,
    })
    expect(configResolver.getCompilerOptions('/project/extra/whatever')).toEqual({
        configFilePath: '/project/extra/tsconfig.json',
        allowUnreachableCode: true,
        allowUnusedLabels: true,
        inlineSourceMap: true,
    })

    fs.existsSync.mockClear()
    fs.readFileSync.mockClear()

    expect(configResolver.getCompilerOptions('/project/extra/whatever')).toEqual({
        configFilePath: '/project/extra/tsconfig.json',
        allowUnreachableCode: true,
        allowUnusedLabels: true,
        inlineSourceMap: true,
    })
    expect(fs.existsSync).not.toBeCalled()
    expect(fs.readFileSync).not.toBeCalled()

    expect(() => configResolver.getCompilerOptions('/path/without/config')).toThrow(/found/)
    expect(() => configResolver.getCompilerOptions('/error')).toThrow(expect.objectContaining({'messageText': expect.stringMatching(/double quotes/)}))
})
