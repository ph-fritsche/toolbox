import { spawn } from 'child_process'
import { TestConductor } from '../TestConductor'

const selfUrl = import.meta.url
const loaderUrl = new URL('./loader.js', selfUrl)
const prepareUrl = new URL('./prepare.cjs', selfUrl)
const nodeFetchUrl = await import.meta.resolve('node-fetch', selfUrl)

export class NodeTestConductor extends TestConductor {
    protected supportedFilesProtocols: string[] = ['file:', 'http:']
    protected includeFilesProtocol: boolean = false

    constructor(
        readonly testRunnerModule: string,
    ) {
        super()
    }

    protected async runTestSuite(
        runId: string,
        setupFiles: string[],
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
            stdio: ['pipe', 'inherit', 'inherit'],
        })

        const promised = new Promise<NodeJS.Signals|null>((res, rej) => {
            child.on('exit', (code, signal) => {
                if (code) {
                    rej(code)
                } else {
                    res(signal)
                }
            })
        })

        let childCode = ''
        child.stdin.end(childCode = `
import { setTestContext, TestGroup, TestRunner } from "${this.testRunnerModule}"
import fetch from "${String(nodeFetchUrl)}"

const exit = process.exit

;(async () => {
    const execModule = async (moduleId) => {
        const defaultExport = await import(moduleId)
        if (typeof defaultExport === 'function') {
            await defaultExport()
        }
    }

    const suite = new TestGroup(${JSON.stringify({id, title: name})})
    setTestContext(globalThis, suite)

    ${setupFiles.map(f => `await execModule(${JSON.stringify(f)})`).join(';')}

    await execModule(${JSON.stringify(testFile)})

    const runner = new TestRunner(${JSON.stringify(this.reporterServerUrl)}, fetch)
    await runner.run(${JSON.stringify(runId)}, suite)

    exit()
})()
        `)

        await promised
    }
}
