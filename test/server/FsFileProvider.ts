import { FsFileProvider } from '#src/server'
import { dirname, resolve } from 'path'

const fixturesDir = resolve(dirname(import.meta.url).replace('file://', ''), '../_fixtures')
test('provide files from file system', async () => {
    const provider = new FsFileProvider(fixturesDir)

    expect(provider.origin).toBe(fixturesDir)
    const f = await provider.getFile('src/javascript.js')
    expect(f.content).toBeInstanceOf(Buffer)
    expect((f.content as Buffer).toString('utf8')).toContain('function echo')
})

test('reject for missing files', () => {
    const provider = new FsFileProvider(fixturesDir)

    return expect(provider.getFile('some/missing/location.js')).rejects.toThrow('ENOENT')
})
