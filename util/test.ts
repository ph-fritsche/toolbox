import path from 'node:path'
import url from 'node:url'
import IstanbulLibReport from 'istanbul-lib-report'
import IstanbulLibSourceMaps from 'istanbul-lib-source-maps'
import IstanbulReports from 'istanbul-reports'
import { NodeTestConductor } from '../src/conductor/NodeTestConductor'
import { setupSourceModuleLoader, setupToolboxTester } from '../src'

const coverageVariable = '__covSelf__'

const PROJECT_ROOT_PATH = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), `../`)
const PROJECT_ROOT_URL = String(url.pathToFileURL(PROJECT_ROOT_PATH))

const conductor = new NodeTestConductor(
    `${PROJECT_ROOT_URL}/src/runner/index.ts`,
    undefined,
    [new URL(PROJECT_ROOT_URL + '/util/testenv.ts')],
    coverageVariable,
)
conductor.loaders.push(
    `${PROJECT_ROOT_URL}/build/loader-src.js`,
)

const tester = setupToolboxTester([
    'src',
    'test',
], [
    conductor,
], [
    await setupSourceModuleLoader({
        instrument: process.env.CI ? coverageVariable : false,
        filesImports: [/(^|\/)node_modules\//],
    }),
])

tester.connectCoverageReporter(async map => {
    const sourceStore = IstanbulLibSourceMaps.createSourceMapStore()
    const reportContext = IstanbulLibReport.createContext({
        coverageMap: await sourceStore.transformCoverage(map),
        dir: PROJECT_ROOT_PATH,
        sourceFinder: f => sourceStore.sourceFinder(f),
        defaultSummarizer: 'nested',
        watermarks: {
            branches: [80, 100],
            functions: [80, 100],
            lines: [80, 100],
            statements: [80, 100],
        },
    })
    IstanbulReports.create('text').execute(reportContext)
})

await tester.start()
