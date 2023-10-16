import { spawn } from 'node:child_process'
import path from 'node:path'
import url from 'node:url'
import { TestConductor } from './TestConductor'
import { HttpReporterServer } from './HttpReporterServer'
import { TestReporter } from './TestReporter'
import { ErrorStackResolver } from './ErrorStackResolver'

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

    async runTestSuite(
        reporter: TestReporter,
        suiteUrl: string,
        filter?: RegExp,
    ) {
        const loaderArgs = ([] as string[]).concat(
            ...this.loaders.map(l => ['--experimental-loader', l]),
        )
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

        const buffer = {out: '', err: ''}
        child.stdout.on('data', d => {
            buffer.out += String(d)
        })
        child.stderr.on('data', d => {
            buffer.err += String(d)
        })
        const stdioClosed = Promise.all([
            new Promise(r => child.stdout.on('close', r)),
            new Promise(r => child.stderr.on('close', r)),
        ])

        const promised = new Promise<typeof buffer & {
            code: number
            signal: NodeJS.Signals | null
            toString(): string
                }>((res, rej) => {
                    child.on('error', error => {
                        rej(error)
                    })
                    child.on('exit', (code, signal) => {
                        void stdioClosed.then(() => {
                            (code ? rej : res)({
                                ...buffer,
                                code: Number(code),
                                signal,
                                toString() {
                                    return [buffer.out, buffer.err].filter(Boolean).join('\n') + '\n'
                                },
                            })
                        })
                    })
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

        await new Promise<void>(r => child.stdin.end(childCode, r))

        await promised
    }
}
