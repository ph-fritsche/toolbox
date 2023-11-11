import { FileProvider } from '#src/server/FileProvider'
import { HttpFileServer } from '#src/server/HttpFileServer'
import { rollup } from 'rollup'
import { afterThis } from '#test/_util'
import { createNodeResolvePlugin, createTsResolvePlugin } from '#src/builder/plugins/resolve'
import { createTransformPlugin } from '#src/builder/plugins/transform'
import { createTestRun } from '#src/conductor/TestRun'
import { NodeTestConductor } from '#src/conductor/NodeTestConductor'
import { getTestFunction } from './_helper'

let runnerModule = ''
beforeEach(async () => {
    const build = await rollup({
        input: './src/runner/index.ts',
        plugins: [
            createTsResolvePlugin({}),
            createNodeResolvePlugin(),
            createTransformPlugin({}),
        ],
    })
    const {output} = await build.generate({})
    runnerModule = output[0].code
})

async function setupConductor() {
    const fileServer = new HttpFileServer(
        new FileProvider(import.meta.url, new Map([
            ['runner.js', Promise.resolve({content: runnerModule})],
        ])),
    )
    const conductor = new NodeTestConductor(`${String(await fileServer.url)}runner.js`)

    afterThis(() => fileServer.close())
    afterThis(() => conductor.close())

    return {
        fileServer,
        conductor,
    }
}

test('conduct test', async () => {
    const { conductor, fileServer } = await setupConductor()
    fileServer.provider.files.set('some/test.js', Promise.resolve({content: `
        test('some test', () => {});
        test('failing test', () => { throw new Error('some error') });
    `}))
    const suiteUrl = String(await fileServer.url) + '/some/test.js'

    const run = createTestRun([conductor], [{url: suiteUrl, title: 'some test'}])
    const suite = run.runs.get(conductor)!.suites.get(suiteUrl)!

    await suite.exec()

    expect(getTestFunction(suite, 1)).toHaveProperty('title', 'some test')
    expect(getTestFunction(suite, 1).result.get()).toHaveProperty('type', 'success')
    expect(getTestFunction(suite, 2)).toHaveProperty('title', 'failing test')
    expect(getTestFunction(suite, 2).result.get()).toHaveProperty('type', 'fail')
})

test('abort test', async () => {
    const { conductor, fileServer } = await setupConductor()
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
