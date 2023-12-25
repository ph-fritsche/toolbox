import path from 'node:path'
import url from 'node:url'
import IstanbulLibReport from 'istanbul-lib-report'
import IstanbulLibSourceMaps from 'istanbul-lib-source-maps'
import IstanbulReports from 'istanbul-reports'
import { setupNodeConductor, setupSourceModuleLoader, setupToolboxTester } from '../src'
import { FileProvider } from '../src/files'
import { HttpFileServer } from '../src/server'

const coverageVariable = '__covSelf__'

const PROJECT_ROOT_PATH = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), `../`)
const PROJECT_ROOT_URL = String(url.pathToFileURL(PROJECT_ROOT_PATH))

const tester = await setupToolboxTester([
    'src',
    'test',
], [
    setupNodeConductor('Node', [
        new URL(PROJECT_ROOT_URL + '/util/testenv.js'),
    ], coverageVariable),
], [
    await setupSourceModuleLoader({
        instrument: process.env.CI ? coverageVariable : false,
        filesImports: [/(^|\/)node_modules\//],
    }),
], {
    runnerFactory: async () => {
        const server = new HttpFileServer(new FileProvider([
            await setupSourceModuleLoader({
                instrument: false,
                filesImports: [/(^|\/)node_modules\//],
            }),
        ]))
        return {
            url: String(await server.url) + 'src/runner/index.ts',
            close: () => server.close(),
        }
    },
})

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
