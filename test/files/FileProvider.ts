import { FileProvider } from '#src/files'

test('provide given files', async () => {
    const someFile = Promise.resolve({content: 'some content'})
    const provider = new FileProvider(
        [],
        new Map([['some/file', someFile]]),
    )

    await expect(provider.get('some/file')).resolves.toHaveProperty('content', 'some content')

    const otherFile = {content: 'other content'}
    provider.files.set('some/other/file', Promise.resolve(otherFile))
    await expect(provider.get('some/other/file')).resolves.toBe(otherFile)
})

test('reject for unknown files', () => {
    const provider = new FileProvider()

    return expect(provider.get('missing/file')).rejects.toBe(undefined)
})

test('get file from loader', async () => {
    const provider = new FileProvider([
        {load: async p => (p === 'some/file'
            ? {content: 'some content'}
            : undefined
        )},
        {load: async p => (p === 'some/other/file'
            ? {content: 'other content'}
            : undefined
        )},
    ])

    await expect(provider.get('some/file')).resolves.toHaveProperty('content', 'some content')
    await expect(provider.get('some/other/file')).resolves.toHaveProperty('content', 'other content')
})
