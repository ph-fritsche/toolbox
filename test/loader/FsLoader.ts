import { FsLoader } from '#src/loader/FsLoader'
import path from 'path'

const fixturesDir = path.resolve(process.env.PROJECT_DIR ?? '', 'test/_fixtures')
test('load files from file system', async () => {
    const loader = new FsLoader(fixturesDir)

    const f = await loader.load('src/javascript.js')
    expect(f.content).toBeInstanceOf(Buffer)
    expect((f.content as Buffer).toString('utf8')).toContain('function echo')
    expect(f.origin).toBe(fixturesDir + '/src/javascript.js')
})

test('reject for missing files', () => {
    const loader = new FsLoader(fixturesDir)

    return expect(loader.load('some/missing/location.js')).rejects.toThrow('ENOENT')
})
