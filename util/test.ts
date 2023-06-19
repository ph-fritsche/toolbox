import path from 'node:path'
import url from 'node:url'
import IstanbulLibCoverage from 'istanbul-lib-coverage'
import IstanbulLibReport from 'istanbul-lib-report'
import IstanbulLibSourceMaps from 'istanbul-lib-source-maps'
import IstanbulReports from 'istanbul-reports'
import { NodeTestConductor } from '../src/conductor/NodeTestConductor'
import { ReporterServer } from '../src/reporter/ReporterServer'
import { ConsoleReporter } from '../src/reporter/ConsoleReporter'
import { watch } from 'chokidar'

if (process.env.CI) {
    process.exitCode = 2
}

type SourceProviderListener = (files: Set<string>, changed: Set<string>) => Promise<void>|void
class SourceProvider {
    constructor(
        paths: string[],
    ) {
        this.watcher = watch(paths)
        this.watcher.on('ready', () => {
            this.ready = true
            this.debounceTrigger()
        })
        this.watcher.on('add', p => this.add(p))
        this.watcher.on('change', p => this.add(p))
        this.watcher.on('unlink', p => this.remove(p))
    }

    public readonly watcher
    protected ready = false

    public close() {
        return this.watcher.close()
    }

    public readonly files = new Set<string>()
    public readonly changed = new Set<string>()

    protected add(p: string) {
        this.files.add(p)
        this.changed.add(p)
        if (this.ready) {
            this.debounceTrigger()
        }
    }
    protected remove(p: string) {
        this.files.delete(p)
        this.changed.delete(p)
    }

    private t?: NodeJS.Timeout
    protected debounceTrigger() {
        clearTimeout(this.t)
        setTimeout(() => {
            void this.listener?.(
                structuredClone(this.files),
                structuredClone(this.changed),
            )
            this.changed.clear()
        }, 50)
    }

    protected listener?: SourceProviderListener
    setListener(cb?: SourceProviderListener) {
        this.listener = cb
        if (this.ready) {
            this.debounceTrigger()
        }
    }
}

const sourceProvider = new SourceProvider([
    'src',
    'test',
])


const coverageVariable = '__covSelf__'

const reporterServer = new ReporterServer()
reporterServer.emitter.addListener('error', ({error}) => console.error(error))

const reporter = new ConsoleReporter()
reporter.connect(reporterServer)
reporter.config.done = true

const PROJECT_ROOT_PATH = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), `../`)
const PROJECT_ROOT_URL = 'file://' + PROJECT_ROOT_PATH

const conductor = new NodeTestConductor(
    reporterServer,
    `${PROJECT_ROOT_URL}/src/runner/index.ts`,
    undefined,
    [{
        server: new URL(PROJECT_ROOT_URL),
        paths: ['util/setup.ts'],
    }],
    coverageVariable,
)
conductor.loaders = [
    `${PROJECT_ROOT_URL}/src/conductor/node/loader-src.js`,
]

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

    const {exec} = conductor.createTestRun({
        server: new URL(PROJECT_ROOT_URL),
        paths: testFiles,
    })

    await exec()
})

if (process.env.CI) {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    reporterServer.emitter.addListener('done', async ({run}) => {
        if (run.errors.size) {
            process.exitCode = 1
        } else if (run.results.size === 0) {
            process.exitCode = 2
        } else {
            process.exitCode = 0
            for (const r of run.results.values()) {
                if (r.status === 'skipped') {
                    process.exitCode = Math.max(process.exitCode ?? 0, 2)
                } else if (r.status === 'fail' || r.status === 'timeout') {
                    process.exitCode = 3
                }
            }
        }

        const coverageMap = IstanbulLibCoverage.createCoverageMap()
        const srcDir = PROJECT_ROOT_PATH + '/src'
        for (const coverage of run.coverage.values()) {
            coverageMap.merge(Object.fromEntries(Object.entries(coverage)
                .filter(([k]) => k.startsWith(srcDir)),
            ))
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
        void reporterServer.close()
    })


}
