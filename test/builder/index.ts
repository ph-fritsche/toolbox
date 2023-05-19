import path from 'node:path'
import fetch from 'node-fetch'
import IstanbulLibCoverage from 'istanbul-lib-coverage'
import IstanbulLibReport from 'istanbul-lib-report'
import IstanbulFileWriter from 'istanbul-lib-report/lib/file-writer.js'
import IstanbulReports from 'istanbul-reports'
import IstanbulLibSourceMap from 'istanbul-lib-source-maps'
import {createProjectBuildProvider} from '#src'

describe('build fixture src', () => {
    const {
        buildProvider,
        fileProvider,
        fileServer,
        onBuildDone,
    } = createProjectBuildProvider([
        path.resolve('./test/_fixtures/src'),
    ], {
        tsConfigFile: './tsconfig.json',
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
        const f = `${fileProvider.origin}/test/_fixtures/src/typescript.ts`
        expect(globalThis.__coverage__).toBeInstanceOf(Object)
        expect(globalThis.__coverage__?.[f]).toBeInstanceOf(Object)

        const coverageMap = IstanbulLibCoverage.createCoverageMap(globalThis.__coverage__)
        const sourceStore = IstanbulLibSourceMap.createSourceMapStore({})
        const coverageRemap = await sourceStore.transformCoverage(coverageMap)
        const context = IstanbulLibReport.createContext({
            coverageMap: coverageRemap,
            dir: fileProvider.origin,
            defaultSummarizer: 'nested',
            sourceFinder: s => sourceStore.sourceFinder(s),
        })

        expect(coverageRemap.fileCoverageFor(f).getUncoveredLines()).toEqual([
            '5',
            '12',
        ])

        expect(getTextReport(context)).toMatchInlineSnapshot(`
          ---------------|---------|----------|---------|---------|-------------------
          File           | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
          ---------------|---------|----------|---------|---------|-------------------
          All files      |      50 |       50 |      50 |      50 |                   
           typescript.ts |      50 |       50 |      50 |      50 | 5,12              
          ---------------|---------|----------|---------|---------|-------------------
        `)
    })
})

function getTextReport(
    context: IstanbulLibReport.Context,
) {
    IstanbulFileWriter.startCapture()
    IstanbulReports.create('text').execute(context)
    IstanbulFileWriter.stopCapture()
    const report: string = IstanbulFileWriter.getOutput()
    IstanbulFileWriter.resetOutput()
    return report
}
