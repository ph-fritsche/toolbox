import path from 'node:path'
import url from 'node:url'
import IstanbulLibCoverage from 'istanbul-lib-coverage'
import IstanbulLibReport from 'istanbul-lib-report'
import IstanbulLibSourceMaps from 'istanbul-lib-source-maps'
import IstanbulReports from 'istanbul-reports'
import { NodeTestConductor } from '../src/conductor/NodeTestConductor'
import { ConsoleReporter } from '../src/reporter/ConsoleReporter'
import { SourceProvider } from './SourceProvider'
import { createTestRun } from '../src/conductor/TestRun'
import { TestRunManager } from '../src/conductor/TestRunManager'
import { TestRunIterator } from '../src/conductor/TestRunIterator'

if (process.env.CI) {
    process.exitCode = 2
}

const sourceProvider = new SourceProvider([
    'src',
    'test',
])

const coverageVariable = '__covSelf__'

const reporter = new ConsoleReporter()

const PROJECT_ROOT_PATH = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), `../`)
const PROJECT_ROOT_URL = 'file://' + PROJECT_ROOT_PATH

const conductor = new NodeTestConductor(
    `${PROJECT_ROOT_URL}/src/runner/index.ts`,
    undefined,
    [new URL(PROJECT_ROOT_URL + '/util/testenv.ts')],
    coverageVariable,
)
conductor.loaders = [
    `${PROJECT_ROOT_URL}/build/loader-src.js`,
]

const manager = new TestRunManager()

sourceProvider.setListener(async (files) => {
    const testFiles = Array.from(files.keys())
        .filter(f => (
            f.startsWith('test/')
            && f.endsWith('.ts') && !f.endsWith('.d.ts')
            && !f.includes('/_')
        ))
        .map(f => (process.env.CI
            ? f + `?coverage=${coverageVariable}`
            : f
        ))
        .map(f => ({
            url: `${PROJECT_ROOT_URL}/${f}`,
            title: f.replace(/^test\//, '').replace(/\.(d\.)?ts(\?.*)?$/, ''),
        }))

    const run = createTestRun([conductor], testFiles)
    reporter.connect(run)

    await manager.exec(TestRunIterator.iterateConductorsBySuites(run))
        .finally(() => reporter.disconnect(run))
        .catch(() => void 0)

    if (process.env.CI) {
        if (run.index.errors.size) {
            process.exitCode = 1
        } else if (run.index.results.size === 0) {
            process.exitCode = 2
        } else if (run.index.results.MIXED.size || run.index.results.fail.size || run.index.results.timeout.size) {
            process.exitCode = 3
        } else if (run.index.results.skipped.size) {
            process.exitCode = Math.max(process.exitCode ?? 0, 2)
        } else {
            process.exitCode = 0
        }

        const coverageMap = IstanbulLibCoverage.createCoverageMap()
        const srcDir = PROJECT_ROOT_PATH + '/src'
        for (const suite of TestRunIterator.iterateSuitesByConductors(run)) {
            if (suite.coverage) {
                coverageMap.merge(Object.fromEntries(Object.entries(suite.coverage)
                    .filter(([k]) => k.startsWith(srcDir)),
                ))
            }
        }
        const sourceStore = IstanbulLibSourceMaps.createSourceMapStore()
        const reportContext = IstanbulLibReport.createContext({
            coverageMap: await sourceStore.transformCoverage(coverageMap),
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

        void sourceProvider.close()
        void conductor.close()
    }
})
