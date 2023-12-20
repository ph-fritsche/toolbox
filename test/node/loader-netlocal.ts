import { resolve } from '#src/node/loader-netlocal'
import { pathToFileURL } from 'url'

test('resolve files and node modules for localhost', async () => {
    const next = mock.fn(() => Promise.resolve({url: 'next-result'}))
    const context: NodeJSLoader.ResolverContext = {
        parentURL: 'http://127.0.0.1:80/file.js',
        conditions: [],
        importAssertions: {},
    }

    await expect(resolve('file:///project/foo', context, next)).resolves.toEqual({
        url: 'file:///project/foo',
        shortCircuit: true,
    })
    await expect(resolve('node:fs/promises', context, next)).resolves.toEqual({
        url: 'node:fs/promises',
        format: 'builtin',
        shortCircuit: true,
    })

    await expect(resolve('some-module', context, next)).resolves.toEqual({
        url: 'next-result',
    })
    expect(next).toHaveBeenLastCalledWith('some-module', {...context,
        parentURL: String(pathToFileURL(process.cwd())) + '/#cli',
    })

    await expect(resolve('./bar', context, next)).resolves.toEqual({
        url: 'next-result',
    })
    expect(next).toHaveBeenCalledWith('./bar', context)

    const unsupportedContext = {...context, parentURL: 'http://example.org/file.js'}
    await expect(resolve('some-module', unsupportedContext, next)).resolves.toEqual({
        url: 'next-result',
    })
    expect(next).toHaveBeenCalledWith('some-module', unsupportedContext)
})
