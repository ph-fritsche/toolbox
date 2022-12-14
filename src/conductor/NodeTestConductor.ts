import { spawn } from 'child_process'
import { TestConductor } from './TestConductor'

const selfUrl = import.meta.url
const loaderUrl = new URL('./node/loader.js', selfUrl)
const prepareUrl = new URL('./node/prepare.cjs', selfUrl)
const nodeFetchUrl = await import.meta.resolve('node-fetch', selfUrl)

export class NodeTestConductor extends TestConductor {
    static readonly supportedFilesProtocols: string[] = ['file:', 'http:']
    static readonly includeFilesProtocol: boolean = false

    protected async runTestSuite(
        runId: string,
        testFile: string,
        id: string,
        name: string,
    ) {
        const child = spawn('node', [
            '--input-type=module',
            '--experimental-network-imports',
            '--experimental-import-meta-resolve',
            '--experimental-loader', loaderUrl.pathname,
            '--require', prepareUrl.pathname,
        ], {
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
            signal?: NodeJS.Signals
            toString(): string
        }>((res, rej) => {
            child.on('error', error => {
                rej(error)
            })
            child.on('exit', (code, signal) => {
                stdioClosed.then(() => {
                    ;(code ? rej : res)({
                        ...buffer,
                        code,
                        signal,
                        toString() {
                            return [buffer.out, buffer.err].filter(Boolean).join('\n') + '\n'
                        }
                    })
                })
            })
        })

        let childCode = ''
        child.stdin.end(childCode = `
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

    const runner = new TestRunner(${JSON.stringify(this.reporterServer.url)}, fetch, setTimeout)
    await runner.run(${JSON.stringify(runId)}, suite)

    exit()
})()
        `)

        await promised
    }
}
