import { TestConductor } from '#src/conductor/TestConductor'
import { TestRunInstance, createTestRun } from '#src/conductor/TestRun'
import { TestRunStack } from '#src/conductor/TestRun/TestRun'
import { TestRunIterator } from '#src/conductor/TestRunIterator'
import { TestRunManager } from '#src/conductor/TestRunManager'
import { promise } from '#src/util/promise'
import { observePromise } from '#test/_util'
import { setupDummyConductor } from './_helper'

function nextTick() {
    return new Promise(r => setImmediate(r))
}
function getTestRunStates(run: TestRunInstance) {
    return Object.fromEntries(Array.from(run.suites.values()).map(s => [s.url, s.state]))
}
function setupDummyTestRun() {
    const {conductor, runTestSuiteExecutor} = setupDummyConductor()
    const suiteExecutions: Array<{suiteUrl: string, filter?: RegExp, resolve: () => void, reject: (r?: unknown) => void}> = []
    runTestSuiteExecutor.mockImplementation(function (res, rej) {
        const {Promise, reject, resolve} = promise<void>()
        suiteExecutions.push({suiteUrl: this.suiteUrl, filter: this.filter, resolve, reject})
        Promise.then(res, rej)
    })
    const run = createTestRun([conductor], [
        {url: 'test://a.js', title: 'a'},
        {url: 'test://b.js', title: 'b'},
        {url: 'test://c.js', title: 'c'},
        {url: 'test://d.js', title: 'd'},
        {url: 'test://e.js', title: 'e'},
        {url: 'test://f.js', title: 'f'},
    ]).runs.get(conductor)!

    return {
        conductor,
        suiteExecutions,
        run,
    }
}

test('iterate suites', async () => {
    const {run, suiteExecutions} = setupDummyTestRun()

    const manager = new TestRunManager()
    manager.maxParallel = 2

    const testFilter = /test-filter/
    const execPromise = observePromise(manager.exec(run.suites.values(), /[^c]/, testFilter))

    expect(getTestRunStates(run)).toEqual({
        'test://a.js': 'running',
        'test://b.js': 'running',
        'test://c.js': 'skipped',
        'test://d.js': 'pending',
        'test://e.js': 'pending',
        'test://f.js': 'pending',
    })

    expect(suiteExecutions.length).toBe(2)
    expect(suiteExecutions[0]).toHaveProperty('suiteUrl', 'test://a.js')
    expect(suiteExecutions[0]).toHaveProperty('filter', testFilter)
    expect(suiteExecutions[1]).toHaveProperty('suiteUrl', 'test://b.js')
    expect(suiteExecutions[1]).toHaveProperty('filter', testFilter)

    suiteExecutions[0].resolve()
    await nextTick()

    expect(getTestRunStates(run)).toEqual({
        'test://a.js': 'done',
        'test://b.js': 'running',
        'test://c.js': 'skipped',
        'test://d.js': 'running',
        'test://e.js': 'pending',
        'test://f.js': 'pending',
    })

    expect(suiteExecutions.length).toBe(3)
    expect(suiteExecutions[2]).toHaveProperty('suiteUrl', 'test://d.js')

    suiteExecutions[2].reject()
    await nextTick()

    expect(run.suites.get('test://d.js')!.errors.count).toBe(1)
    expect(getTestRunStates(run)).toEqual({
        'test://a.js': 'done',
        'test://b.js': 'running',
        'test://c.js': 'skipped',
        'test://d.js': 'done',
        'test://e.js': 'running',
        'test://f.js': 'pending',
    })

    expect(suiteExecutions[3]).toHaveProperty('suiteUrl', 'test://e.js')

    suiteExecutions[1].resolve()
    suiteExecutions[3].resolve()
    await nextTick()

    expect(execPromise.state).toBe('pending')
    expect(suiteExecutions[4]).toHaveProperty('suiteUrl', 'test://f.js')

    suiteExecutions[4].resolve()
    await nextTick()

    expect(execPromise.state).toBe('resolved')
    expect(getTestRunStates(run)).toEqual({
        'test://a.js': 'done',
        'test://b.js': 'done',
        'test://c.js': 'skipped',
        'test://d.js': 'done',
        'test://e.js': 'done',
        'test://f.js': 'done',
    })
})

test('abort iteration', async () => {
    const {run, suiteExecutions} = setupDummyTestRun()

    const manager = new TestRunManager()
    manager.maxParallel = 2

    const execPromise = observePromise(manager.exec(run.suites.values(), /[^a]/))

    expect(getTestRunStates(run)).toEqual({
        'test://a.js': 'skipped',
        'test://b.js': 'running',
        'test://c.js': 'running',
        'test://d.js': 'pending',
        'test://e.js': 'pending',
        'test://f.js': 'pending',
    })
    expect(suiteExecutions[1]).toHaveProperty('suiteUrl', 'test://c.js')

    suiteExecutions[1].resolve()
    await nextTick()

    expect(getTestRunStates(run)).toEqual({
        'test://a.js': 'skipped',
        'test://b.js': 'running',
        'test://c.js': 'done',
        'test://d.js': 'running',
        'test://e.js': 'pending',
        'test://f.js': 'pending',
    })

    manager.abort()
    await nextTick()

    expect(execPromise.state).toBe('rejected')
    expect(getTestRunStates(run)).toEqual({
        'test://a.js': 'skipped',
        'test://b.js': 'skipped',
        'test://c.js': 'done',
        'test://d.js': 'skipped',
        'test://e.js': 'skipped',
        'test://f.js': 'skipped',
    })
})

test('subsequent `exec` call aborts previous run', async () => {
    const a = setupDummyTestRun()
    const b = setupDummyTestRun()

    const manager = new TestRunManager()
    manager.maxParallel = 3

    const execPromiseA = observePromise(manager.exec(a.run.suites.values()))

    expect(execPromiseA.state).toBe('pending')
    expect(getTestRunStates(a.run)).toEqual({
        'test://a.js': 'running',
        'test://b.js': 'running',
        'test://c.js': 'running',
        'test://d.js': 'pending',
        'test://e.js': 'pending',
        'test://f.js': 'pending',
    })

    const execPromiseB = observePromise(manager.exec(b.run.suites.values()))
    await nextTick()

    expect(execPromiseA.state).toBe('rejected')
    expect(getTestRunStates(a.run)).toEqual({
        'test://a.js': 'skipped',
        'test://b.js': 'skipped',
        'test://c.js': 'skipped',
        'test://d.js': 'skipped',
        'test://e.js': 'skipped',
        'test://f.js': 'skipped',
    })
    expect(execPromiseB.state).toBe('pending')
    expect(getTestRunStates(b.run)).toEqual({
        'test://a.js': 'running',
        'test://b.js': 'running',
        'test://c.js': 'running',
        'test://d.js': 'pending',
        'test://e.js': 'pending',
        'test://f.js': 'pending',
    })
})

test('run test files', async () => {
    const manager = new TestRunManager()
    const execMock = mock.fn<TestRunManager['exec']>(() => Promise.resolve())
    Reflect.set(manager, 'exec', execMock)

    const listener = mock.fn<(e: {type: string, run: TestRunStack}) => void>()
    manager.addListener('create', listener)
    manager.addListener('abort', listener)
    manager.addListener('complete', listener)
    manager.addListener('done', listener)

    const conductor = {} as TestConductor
    const filterSuites = new RegExp('')
    const filterTests = new RegExp('')
    const runA = observePromise(manager.run([conductor], [
        {url: 'test://a.js', title: 'a'},
        {url: 'test://b.js', title: 'b'},
    ], TestRunIterator.iterateConductorsBySuites, filterSuites, filterTests))

    expect(listener).toHaveBeenNthCalledWith(1, {type: 'create', run: expect.any(TestRunStack)})
    const runARun = listener.mock.lastCall![0].run
    expect(execMock).toBeCalledTimes(1)
    const suites = Array.from(execMock.mock.lastCall![0])
    expect(suites[0].run.conductor).toBe(conductor)
    expect(suites[1].run.conductor).toBe(conductor)
    expect(execMock.mock.lastCall![1]).toBe(filterSuites)
    expect(execMock.mock.lastCall![2]).toBe(filterTests)

    await nextTick()

    expect(listener).toHaveBeenNthCalledWith(2, {type: 'complete', run: runARun})
    expect(listener).toHaveBeenNthCalledWith(3, {type: 'done', run: runARun})
    expect(runA.state).toBe('resolved')

    execMock.mockImplementation(() => Promise.reject())
    const runB = observePromise(manager.run([conductor], [
        {url: 'test://a.js', title: 'a'},
        {url: 'test://b.js', title: 'b'},
    ], TestRunIterator.iterateConductorsBySuites))

    expect(listener).toHaveBeenNthCalledWith(4, {type: 'create', run: expect.any(TestRunStack)})
    const runBRun = listener.mock.lastCall![0].run
    expect(execMock).toBeCalledTimes(2)

    await nextTick()

    expect(listener).toHaveBeenNthCalledWith(5, {type: 'abort', run: runBRun})
    expect(listener).toHaveBeenNthCalledWith(6, {type: 'done', run: runBRun})
    expect(runB.state).toBe('resolved')
})
