import { FileProvider } from '#src/server/FileProvider'
import { HttpFileServer } from '#src/server/HttpFileServer'
import { rollup } from 'rollup'
import { afterThis } from '#test/_util'
import { createNodeResolvePlugin, createTsResolvePlugin } from '#src/builder/plugins/resolve'
import { createTransformPlugin } from '#src/builder/plugins/transform'
import { createTestRun } from '#src/conductor/TestRun'
import { ChromeTestConductor } from '#src/conductor/ChromeTestConductor'
import { getTestFunction } from './_helper'

let fileServer: HttpFileServer
beforeAll(async () => {
    const build = await rollup({
        input: './src/runner/index.ts',
        plugins: [
            createTsResolvePlugin({}),
            createNodeResolvePlugin(),
            createTransformPlugin({}),
        ],
    })
    const {output} = await build.generate({})
    const runnerModule = output[0].code

    fileServer = new HttpFileServer(
        new FileProvider(import.meta.url, new Map([
            ['runner.js', Promise.resolve({content: runnerModule})],
        ])),
    )
    await fileServer.url
})
afterAll(() => fileServer.close())

async function setupConductor() {
    const conductor = new ChromeTestConductor(`${String(await fileServer.url)}runner.js`)

    afterThis(() => conductor.close())

    return {conductor}
}

test('launch browser', async () => {
    const {conductor} = await setupConductor()
    await conductor.browser
})

test('conduct test', async () => {
    const {conductor} = await setupConductor()
    fileServer.provider.files.set('some/test.js', Promise.resolve({content: `
        test('some test', () => {});
        test('failing test', () => { throw new Error('some error') });
    `}))
    const suiteUrl = String(await fileServer.url) + '/some/test.js'

    const run = createTestRun([conductor], [{url: suiteUrl, title: 'some test'}])
    const suite = run.runs.get(conductor)!.suites.get(suiteUrl)!

    await suite.exec()

    expect(Array.from(suite.errors)).toEqual([])
    expect(getTestFunction(suite, 1)).toHaveProperty('title', 'some test')
    expect(getTestFunction(suite, 1).result.get()).toHaveProperty('type', 'success')
    expect(getTestFunction(suite, 2)).toHaveProperty('title', 'failing test')
    expect(getTestFunction(suite, 2).result.get()).toHaveProperty('type', 'fail')

    expect((await (await conductor.browser).pages()).length).toBe(0)
})

test('abort test', async () => {
    const { conductor } = await setupConductor()
    fileServer.provider.files.set('some/test.js', Promise.resolve({content: `
        test('some test', () => {});
        test('aborted test', () => new Promise(r => setTimeout(r, 10000)));
    `}))
    const suiteUrl = String(await fileServer.url) + '/some/test.js'

    const run = createTestRun([conductor], [{url: suiteUrl, title: 'some test'}])
    const suite = run.runs.get(conductor)!.suites.get(suiteUrl)!

    const promise = suite.exec()
    suite.addListener('result', () => promise.abort('test'))

    const listener = mock.fn()
    await promise.catch(listener)

    expect(listener).toBeCalledWith(promise.signal)
    expect(promise.signal.reason).toBe('test')
    expect(suite.state).toBe('skipped')
    expect(getTestFunction(suite, 1).result.get()).toHaveProperty('type', 'success')
    expect(getTestFunction(suite, 2).result.get()).toBe(undefined)
})
