import { FileProvider } from '#src/files'
import { HttpFileServer } from '#src/server'
import { afterThis } from '#test/_util'
import { createTestRun } from '#src/conductor/TestRun'
import { NodeTestConductor } from '#src/conductor/NodeTestConductor'
import { getTestFunction } from './_helper'
import { setupToolboxRunner } from '#test/_setup'

async function setupConductor() {
    const runner = await setupToolboxRunner()
    const fileServer = new HttpFileServer(new FileProvider())

    const conductor = new NodeTestConductor(runner.url)

    afterThis(() => conductor.close())
    afterThis(() => runner.close())
    afterThis(() => fileServer.close())

    return {conductor, fileServer}
}

test('conduct test', async () => {
    const { conductor, fileServer } = await setupConductor()
    fileServer.provider.files.set('some/test.js', Promise.resolve({content: `
        test('some test', () => {});
        test('failing test', () => { throw new Error('some error') });
    `}))
    const suiteUrl = String(await fileServer.url) + 'some/test.js'

    const run = createTestRun([conductor], [{url: suiteUrl, title: 'some test'}])
    const suite = run.runs.get(conductor)!.suites.get(suiteUrl)!

    await expect(suite.exec()).resolves.toBe(undefined)

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
    const suiteUrl = String(await fileServer.url) + 'some/test.js'

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
