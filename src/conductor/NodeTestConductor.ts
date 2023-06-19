import { spawn } from 'node:child_process'
import { TestConductor } from './TestConductor'
import path from 'node:path'
import url from 'node:url'

if (!import.meta.resolve) {
    throw new Error('`import.meta.resolve` is required. Run with `--experimental-import-meta-resolve`!')
}
const nodeFetchUrl = await import.meta.resolve('node-fetch', import.meta.url)

const loaderPath = path.dirname(url.fileURLToPath(import.meta.url)) + '/node'

export class NodeTestConductor extends TestConductor {
    static readonly supportedFilesProtocols: string[] = ['file:', 'http:']
    static readonly includeFilesProtocol: boolean = false

    public loaders = [
        `${loaderPath}/loader-netlocal.js`,
    ]

    protected async runTestSuite(
        runId: string,
        testFile: string,
        id: string,
        name: string,
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

        const childCode = `
import { setTestContext, TestGroup, TestRunner } from "${this.testRunnerModule}"
import fetch from "${String(nodeFetchUrl)}"

const exit = process.exit
const setTimeout = global.setTimeout

;(async () => {
    const execModule = async (moduleId) => {
        const defaultExport = await import(moduleId)
        if (typeof defaultExport === 'function') {
            await defaultExport()
        }
    }

    const suite = new TestGroup(${JSON.stringify({id, title: name})})
    setTestContext(globalThis, suite)

    ${this.setupFiles.map(f => `await execModule(${JSON.stringify(f)})`).join(';')}

    await execModule(${JSON.stringify(testFile)})

    const runner = new TestRunner(${JSON.stringify(await this.reporterServer.url)}, fetch, setTimeout, ${JSON.stringify(this.coverageVar)})
    await runner.run(${JSON.stringify(runId)}, suite)

    exit()
})()
        `

        await new Promise<void>(r => child.stdin.end(childCode, r))

        await promised
    }
}
