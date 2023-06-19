import { FsFileProvider } from '#src/server'
import path from 'path'

const fixturesDir = path.resolve(process.env.PROJECT_DIR ?? '', 'test/_fixtures')
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
