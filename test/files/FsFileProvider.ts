import { FsFileProvider } from '#src/files'
import path from 'path'

const fixturesDir = path.resolve(process.env.PROJECT_DIR ?? '', 'test/_fixtures')
test('provide files from file system', async () => {
    const provider = new FsFileProvider(fixturesDir)

    const f = await provider.get('src/javascript.js')
    expect(f.content).toBeInstanceOf(Buffer)
    expect((f.content as Buffer).toString('utf8')).toContain('function echo')
    expect(f.origin).toBe(fixturesDir + '/src/javascript.js')
})

test('reject for missing files', () => {
    const provider = new FsFileProvider(fixturesDir)

    return expect(provider.get('some/missing/location.js')).rejects.toThrow('ENOENT')
})
