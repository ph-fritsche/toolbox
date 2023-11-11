import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import path from 'node:path'
import type internal from 'node:stream'
import url from 'node:url'
import { TestConductor } from './TestConductor'
import { HttpReporterServer } from './HttpReporterServer'
import { TestReporter } from './TestReporter'
import { ErrorStackResolver } from './ErrorStackResolver'
import { AbortablePromise } from '../util/AbortablePromise'

if (!import.meta.resolve) {
    throw new Error('`import.meta.resolve` is required. Run with `--experimental-import-meta-resolve`!')
}
const nodeFetchUrl = await import.meta.resolve('node-fetch', import.meta.url)

const loaderPath = path.dirname(url.fileURLToPath(import.meta.url)) + '/node'

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
                '--experimental-network-imports',
                '--experimental-import-meta-resolve',
                '--require', `${loaderPath}/experimental.cjs`,
                // TODO: handle resolved source mappings in ReporterServer
                // '--enable-source-maps',
                ...loaderArgs,
            ], {
                env: {
                    ...process.env,
                    INSTRUMENT_COVERAGE_VAR: this.coverageVar,
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
import fetch from "${String(nodeFetchUrl)}"

const exit = process.exit
const setTimeout = global.setTimeout

;(async () => {
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
})()
        `

        const whenClosed = (stream: internal.Readable) => stream.closed ? Promise.resolve() : new Promise(r => stream.on('close', r))
        await new Promise<void>((res, rej) => {
            child.on('error', rej)

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
