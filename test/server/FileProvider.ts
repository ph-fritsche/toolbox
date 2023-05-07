import { FileProvider } from '#src/server'

test('provide given files', async () => {
    const someFile = Promise.resolve({content: 'some content'})
    const provider = new FileProvider(
        'xyz://some/source',
        new Map([['some/file', someFile]]),
    )
    expect(provider.origin).toBe('xyz://some/source')

    await expect(provider.getFile('some/file')).resolves.toHaveProperty('content', 'some content')

    const otherFile = {content: 'other content'}
    provider.files.set('some/other/file', Promise.resolve(otherFile))
    await expect(provider.getFile('some/other/file')).resolves.toBe(otherFile)
})

test('reject for unknown files', () => {
    const provider = new FileProvider('xyz://some/source')

    return expect(provider.getFile('missing/file')).rejects.toBe(undefined)
})

test('ignore leading slash', () => {
    const provider = new FileProvider()
    const file = {content: 'content'}
    provider.files.set('some/file', Promise.resolve(file))

    return expect(provider.getFile('////some/file')).resolves.toBe(file)
})

test('reject relative paths', () => {
    const provider = new FileProvider()

    return expect(provider.getFile('./file')).rejects.toThrow('not supported')
})
