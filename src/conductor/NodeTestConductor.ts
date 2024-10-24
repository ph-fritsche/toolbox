import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import path from 'node:path'
import type internal from 'node:stream'
import url from 'node:url'
import { TestConductor } from './TestConductor'
import { HttpReporterServer } from './HttpReporterServer'
import { TestReporter } from './TestReporter'
import { ErrorStackResolver } from './ErrorStackResolver'
import { AbortablePromise } from '../util/AbortablePromise'

const loaderPathEnv = 'ToolboxNodeLoadersPath'
const loaderPath = (() => {
    if (process.env[loaderPathEnv]) {
        return process.env[loaderPathEnv]
    } else if (import.meta.url.startsWith('file://')) {
        return path.resolve(url.fileURLToPath(import.meta.url), '../../node')
    }
    throw new Error(`Could not determine path for node loaders. Try to set env variable '${loaderPathEnv}'.`)
})()

export class NodeTestConductor extends TestConductor {
    constructor(
        public readonly testRunnerModule: string,
        title?: string,
        setupFiles: URL[] = [],
        coverageVar = '__coverage__',
        errorStackResolver = new ErrorStackResolver([]),
    ) {
        super(title, setupFiles, coverageVar)

        this.reporterServer = new HttpReporterServer(errorStackResolver)
    }

    readonly reporterServer: HttpReporterServer

    async close(): Promise<void> {
        await this.reporterServer.close()
    }

    public loaders = [
        `${loaderPath}/loader-netlocal.js`,
    ]

    runTestSuite(
        reporter: TestReporter,
        suiteUrl: string,
        filter?: RegExp,
        abortController: AbortController = new AbortController(),
    ) {
        const loaderArgs = ([] as string[]).concat(
            ...this.loaders.map(l => ['--experimental-loader', l]),
        )

        return new AbortablePromise<void>(abortController, (resolve, reject, onTeardown) => {
            const child = spawn('node', [
                '--input-type=module',
                '--experimental-import-meta-resolve',
                '--require', `${loaderPath}/experimental.cjs`,
                // TODO: handle resolved source mappings in ReporterServer
                // '--enable-source-maps',
                ...loaderArgs,
            ], {
                env: {
                    ...process.env,
                    INSTRUMENT_COVERAGE_VAR: this.coverageVar,
                    [loaderPathEnv]: loaderPath,
                },
                stdio: ['pipe', 'pipe', 'pipe'],
            })

            onTeardown(() => {
                if (child.exitCode === null) {
                    child.kill()
                }
            })

            this.execTestSuiteInChild(child, reporter, suiteUrl, filter)
                .then(resolve, reject)
        })
    }

    protected async execTestSuiteInChild(
        child: ChildProcessWithoutNullStreams,
        reporter: TestReporter,
        suiteUrl: string,
        filter?: RegExp,
    ) {
        const buffer = {out: '', err: ''}
        child.stdout.on('data', d => {
            buffer.out += String(d)
        })
        child.stderr.on('data', d => {
            buffer.err += String(d)
        })

        const reporterId = this.reporterServer.registerReporter(reporter)

        const childCode = `
import { TestRunner, HttpReporterClient } from "${this.testRunnerModule}"

const fetch = global.fetch
const exit = process.exit
const setTimeout = global.setTimeout

await new TestRunner(
    new HttpReporterClient(
        ${JSON.stringify(await this.reporterServer.url)},
        fetch,
        ${JSON.stringify(reporterId)},
    ),
    setTimeout,
).run(
    ${JSON.stringify(this.setupFiles)},
    ${JSON.stringify(suiteUrl)},
    ${filter ? `new RegExp(${JSON.stringify(filter.source)}, ${JSON.stringify(filter.flags)})` : JSON.stringify(undefined)},
    ${JSON.stringify(this.coverageVar)},
)

exit()
        `

        const whenClosed = (stream: internal.Readable) => stream.closed ? Promise.resolve() : new Promise(r => stream.on('close', r))
        await new Promise<void>((res, rej) => {
            child.on('error', rej)

            child.stdin.on('error', (e: NodeJS.ErrnoException) => {
                child.kill()
                if (e.code === 'EPIPE') {
                    // Bad options cause pipe errors on stdin.
                    // Just killing the child provides a clearer error message.
                } else {
                    throw e
                }
            })

            child.stdin.end(childCode)

            child.on('exit', (code, signal) => {
                Promise.all([
                    whenClosed(child.stdout),
                    whenClosed(child.stderr),
                ]).finally(() => {
                    if (code) {
                        rej({
                            ...buffer,
                            code: Number(code),
                            signal,
                            toString() {
                                return [buffer.out, buffer.err].filter(Boolean).join('\n') + '\n'
                            },
                        })
                    } else {
                        res()
                    }
                })
            })
        })
    }
}
