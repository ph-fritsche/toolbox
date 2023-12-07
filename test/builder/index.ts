import path from 'node:path'
import fetch from 'node-fetch'
import IstanbulLibCoverage, {CoverageMapData} from 'istanbul-lib-coverage'
import IstanbulLibSourceMap from 'istanbul-lib-source-maps'
import {createProjectBuildProvider} from '#src'

const fixturesPath = path.resolve('./test/_fixtures/src')
describe('build fixture src', () => {
    const {
        buildProvider,
        fileProvider,
        fileServer,
        onBuildDone,
    } = createProjectBuildProvider([
        fixturesPath,
    ], {
    })

    afterAll(async () => {
        await Promise.allSettled([
            buildProvider.close(),
            fileServer.close(),
        ])
    })

    test('provide transpiled code', async () => {
        await new Promise<void>(r => onBuildDone(async () => r()))

        expect(Array.from(fileProvider.files.keys()).sort()).toEqual([
            'test/_fixtures/src/javascript.js',
            'test/_fixtures/src/typescript.js',
        ])
    })

    test('serve code', async () => {
        const f = `${String(await fileServer.url)}test/_fixtures/src/typescript.js`

        const response = await fetch(f)
        expect(response).toHaveProperty('status', 200)
        const code = await response.text()

        const m = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`)

        expect(m).toEqual(expect.objectContaining({
            echoFoo: expect.any(Function),
            error: expect.any(Function),
        }))
        expect(m.echoFoo('x')).toBe('foo')
    })

    test('serve instrumented code', async () => {
        const f = `${fixturesPath}/typescript.ts`
        const cov = (globalThis as {__coverage__?: CoverageMapData}).__coverage__
        expect(cov).toBeInstanceOf(Object)
        expect(cov?.[f]).toBeInstanceOf(Object)

        const coverageMap = IstanbulLibCoverage.createCoverageMap(cov)
        const sourceStore = IstanbulLibSourceMap.createSourceMapStore({})
        const coverageRemap = await sourceStore.transformCoverage(coverageMap)
        expect(coverageRemap.fileCoverageFor(f).getLineCoverage()).toEqual({
            4: 1,
            5: 0,
            7: 1,
            12: 0,
        })
    })
})
