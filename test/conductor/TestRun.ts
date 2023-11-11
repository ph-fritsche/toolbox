import type { CoverageMapData } from 'istanbul-lib-coverage'
import { promise } from '#src/util/promise'
import { createTestRun, TestHookType, TestResultType, TestRunState } from '#src/conductor/TestRun'
import { TestError } from '#src/conductor/TestRun/TestError'
import { TestFunction } from '#src/conductor/TestRun/TestFunction'
import { TestGroup } from '#src/conductor/TestRun/TestGroup'
import { TestResult } from '#src/conductor/TestRun/TestResult'
import { getSuiteReporter, getTestFunction, getTestGroup, setSuiteState, setupDummyConductor, setupDummySuite, setupRunningSuite } from './_helper'
import { createTestElements } from '#src/conductor/TestRun/createTestElements'
import { TestNodeData } from '#src/conductor/TestReporter'

test('create test run', async () => {
    const { conductor: conductorA } = setupDummyConductor('A')
    const { conductor: conductorB } = setupDummyConductor('B')
    const run = createTestRun([conductorA, conductorB], [
        {url: 'test://foo.js', title: 'foo'},
        {url: 'test://bar.js', title: 'bar'},
        {url: 'test://baz.js', title: 'baz'},
    ])

    expect(Array.from(run.runs.keys())).toEqual([
        conductorA,
        conductorB,
    ])
    expect(Array.from(run.suites.keys())).toEqual([
        'test://foo.js',
        'test://bar.js',
        'test://baz.js',
    ])
    expect(Array.from(run.suites.get('test://foo.js')!.instances.keys())).toEqual([
        run.runs.get(conductorA),
        run.runs.get(conductorB),
    ])
    expect(Array.from(run.runs.get(conductorA)!.suites.keys())).toEqual([
        'test://foo.js',
        'test://bar.js',
        'test://baz.js',
    ])
    expect(run.runs.get(conductorB)?.suites.get('test://bar.js'))
        .toBe(run.suites.get('test://bar.js')?.instances.get(run.runs.get(conductorB)!))
})

test('events bubble', async () => {
    const {conductor: conductorA} = setupDummyConductor()
    const {conductor: conductorB} = setupDummyConductor()
    const runStack = createTestRun([conductorA, conductorB], [
        {url: 'test://foo.js', title: 'foo'},
        {url: 'test://bar.js', title: 'bar'},
    ])
    const run = runStack.runs.get(conductorA)!
    const suite = run.suites.get('test://foo.js')!
    const group = TestGroup.create(suite, 1, 'some group', 'ident')
    const func = TestFunction.create(group, 2, 'some func', 'ident')

    const garbage = mock.fn()
    runStack.suites.get('test://bar.js')?.addListener('start', garbage)
    runStack.runs.get(conductorB)?.addListener('start', garbage)

    const onFunc = mock.fn()
    const onGroup = mock.fn()
    const onSuite = mock.fn()
    const onRun = mock.fn()
    func.addListener('start', onFunc)
    group.addListener('start', onGroup)
    suite.addListener('start', onSuite)
    run.addListener('start', onRun)

    const onFuncStack = mock.fn()
    const onGroupStack = mock.fn()
    const onSuiteStack = mock.fn()
    const onRunStack = mock.fn()
    func.stack.addListener('start', onFuncStack)
    group.stack.addListener('start', onGroupStack)
    suite.stack.addListener('start', onSuiteStack)
    run.stack.addListener('start', onRunStack)

    Reflect.get(func, 'dispatch').call(func, 'start', {foo: 'bar'})

    expect(garbage).not.toBeCalled()
    expect(onFunc).toBeCalledWith({type: 'start', foo: 'bar'})
    expect(onGroup).toBeCalledWith({type: 'start', foo: 'bar'})
    expect(onSuite).toBeCalledWith({type: 'start', foo: 'bar'})
    expect(onRun).toBeCalledWith({type: 'start', foo: 'bar'})
    expect(onFuncStack).toBeCalledWith({type: 'start', foo: 'bar'})
    expect(onGroupStack).toBeCalledWith({type: 'start', foo: 'bar'})
    expect(onSuiteStack).toBeCalledWith({type: 'start', foo: 'bar'})
    expect(onRunStack).toBeCalledWith({type: 'start', foo: 'bar'})
})

test('run test suite', async () => {
    const { conductor, runTestSuite, runTestSuiteExecutor } = setupDummyConductor('A')
    const runTestSuitePromise = promise<void>()
    runTestSuiteExecutor.mockImplementation(r => void runTestSuitePromise.Promise.then(r))
    const runStack = createTestRun([conductor], [{url: 'test://foo.js', title: 'foo'}])
    const onStart = mock.fn()
    runStack.addListener('start', onStart)
    const onDone = mock.fn()
    runStack.addListener('done', onDone)
    const suite = runStack.runs.get(conductor)!.suites.get('test://foo.js')!

    expect(suite.state).toBe('pending')

    const execPromise = suite.exec(/some filter/)

    expect(suite.state).toBe('running')
    expect(onStart).toBeCalledWith({type: 'start', node: suite})

    expect(runTestSuite).toBeCalledWith(
        expect.objectContaining({
            complete: expect.any(Function),
            error: expect.any(Function),
            result: expect.any(Function),
            schedule: expect.any(Function),
        }),
        'test://foo.js',
        /some filter/,
        undefined,
    )

    runTestSuitePromise.resolve()

    await expect(execPromise).resolves.toBe(undefined)

    expect(suite.state).toBe('done')
    expect(onDone).toBeCalledWith({type: 'done', node: suite})
})

test('prevent reporting on non-running suite', async () => {
    const {suite, runTestSuiteExecutor} = setupDummySuite()
    runTestSuiteExecutor.mockImplementation(r => r())

    expect(() => getSuiteReporter(suite).schedule({nodes: []})).toThrow('pending')
    expect(() => getSuiteReporter(suite).error({error: ''})).toThrow('pending')
    expect(() => getSuiteReporter(suite).result({nodeId: 1, type: TestResultType.skipped})).toThrow('pending')
    expect(() => getSuiteReporter(suite).complete({})).toThrow('pending')

    await suite.exec()

    expect(() => getSuiteReporter(suite).schedule({nodes: []})).toThrow('done')
    expect(() => getSuiteReporter(suite).error({error: ''})).toThrow('done')
    expect(() => getSuiteReporter(suite).result({nodeId: 1, type: TestResultType.skipped})).toThrow('done')
    expect(() => getSuiteReporter(suite).complete({})).toThrow('done')
})

test('skip suite', async () => {
    const {suite} = setupDummySuite()
    const onSkip = mock.fn()
    suite.addListener('skip', onSkip)

    expect(suite.state).toBe('pending')

    suite.skip()

    expect(suite.state).toBe('skipped')
    expect(onSkip).toBeCalledWith({type: 'skip', node: suite})
})

test('abort suite', async () => {
    const {suite, runTestSuiteExecutor} = setupDummySuite()
    runTestSuiteExecutor.mockImplementation(() => void 0)
    const onSkip = mock.fn()
    suite.addListener('skip', onSkip)

    expect(suite.state).toBe('pending')

    const execPromise = suite.exec()

    expect(suite.state).toBe('running')
    expect(runTestSuiteExecutor).toBeCalled()

    execPromise.abort()
    await expect(execPromise).rejects.toBe(execPromise.signal)

    expect(suite.state).toBe('skipped')
    expect(onSkip).toBeCalledWith({type: 'skip', node: suite})
})

test('schedule nodes', async () => {
    const {suite} = setupRunningSuite()
    const onSchedule = mock.fn()
    suite.addListener('schedule', onSchedule)

    getSuiteReporter(suite).schedule({nodes: [
        {id: 1, title: 'Group A', children: [
            {id: 2, title: 'Test 1'},
            {id: 3, title: 'Group Foo', children: [
                {id: 4, title: 'Test 2'},
                {id: 5, title: 'Test 3'},
            ]},
            {id: 6, title: 'Test 4'},
        ]},
        {id: 7, title: 'Group B', children: [
            {id: 8, title: 'Test 5'},
            {id: 9, title: 'Test Foo'},
        ]},
        {id: 10, title: 'Group C', children: []},
    ]})

    expect(onSchedule).toBeCalledWith({type: 'schedule', node: suite})
    expect(Array.from(suite.children.values())).toEqual([
        suite.nodes.get(1),
        suite.nodes.get(7),
        suite.nodes.get(10),
    ])
    expect(suite.nodes.get(1)).toBeInstanceOf(TestGroup)
    expect((suite.nodes.get(1) as TestGroup).parent).toBe(suite)
    expect(Array.from((suite.nodes.get(1) as TestGroup).children.values())).toEqual([
        suite.nodes.get(2),
        suite.nodes.get(3),
        suite.nodes.get(6),
    ])
    expect(suite.nodes.get(3)).toBeInstanceOf(TestGroup)
    expect((suite.nodes.get(3) as TestGroup).parent).toBe(suite.nodes.get(1))
    expect(Array.from((suite.nodes.get(3) as TestGroup).children.values())).toEqual([
        suite.nodes.get(4),
        suite.nodes.get(5),
    ])
    expect(suite.nodes.get(5)).toBeInstanceOf(TestFunction)
    expect((suite.nodes.get(5) as TestFunction).parent).toBe(suite.nodes.get(3))
    expect(suite.nodes.get(10)).toBeInstanceOf(TestGroup)
})

test('schedule multiple nodes with same title', async () => {
    const {suite} = setupRunningSuite()

    getSuiteReporter(suite).schedule({nodes: [
        {id: 1, title: 'Foo'},
        {id: 2, title: 'Foo', children: []},
        {id: 3, title: 'Foo', children: []},
        {id: 4, title: 'Foo'},
    ]})

    expect(Array.from(suite.children.keys())).toEqual([
        'TestFunction:Foo:1',
        'TestGroup:Foo:1',
        'TestGroup:Foo:2',
        'TestFunction:Foo:2',
    ])
    expect(suite.nodes.get(2)!.stack).toBe(suite.stack.children.get('TestGroup:Foo:1'))
    expect(suite.nodes.get(3)!.stack).toBe(suite.stack.children.get('TestGroup:Foo:2'))
})

test('throw error when scheduling node id twice', async () => {
    const {suite} = setupRunningSuite()

    expect(() => getSuiteReporter(suite).schedule({nodes: [
        {id: 1, title: 'Foo'},
        {id: 1, title: 'Foo'},
    ]})).toThrow('already exists')
})

test('report errors', async () => {
    const {suite} = setupRunningSuite()
    const group = TestGroup.create(suite, 123, 'some group', 'ident')
    const onSuiteError = mock.fn()
    suite.addListener('error', onSuiteError)
    const onGroupError = mock.fn()
    group.addListener('error', onGroupError)

    getSuiteReporter(suite).error({error: 'foo'})
    getSuiteReporter(suite).error({nodeId: 123, error: 'bar', hook: {type: TestHookType.beforeEach, index: 30, name: 'some hook', cleanup: true}})
    getSuiteReporter(suite).error({nodeId: undefined, error: 'baz'})

    expect(Array.from(suite.errors)).toEqual([
        new TestError('foo'),
        new TestError('baz'),
    ])
    expect(Array.from(group.errors)).toEqual([
        new TestError('bar', {type: TestHookType.beforeEach, index: 30, name: 'some hook', cleanup: true}),
    ])
    expect(onSuiteError).toBeCalledTimes(3)
    expect(onSuiteError).toHaveBeenNthCalledWith(1, {type: 'error', node: suite, error: new TestError('foo')})
    expect(onSuiteError).toHaveBeenNthCalledWith(3, {type: 'error', node: suite, error: new TestError('baz')})
    expect(onGroupError).toBeCalledTimes(1)
    expect(onGroupError).toBeCalledWith({type: 'error', node: group, error: expect.objectContaining({error: 'bar'})})
})

test('throw error when reporting error on function', async () => {
    const {suite} = setupRunningSuite()
    TestFunction.create(suite, 1, 'foo', 'foo')

    expect(() => getSuiteReporter(suite).error({nodeId: 1, error: ''})).toThrow('Can not add error')
})

test('report results', async () => {
    const {suite} = setupRunningSuite()
    const testfunc = TestFunction.create(suite, 123, 'some test', 'ident')
    const onResult = mock.fn()
    testfunc.addListener('result', onResult)

    getSuiteReporter(suite).result({nodeId: 123, type: TestResultType.fail, error: 'some error', duration: 456})

    expect(testfunc.result.get()).toEqual({
        type: TestResultType.fail,
        error: 'some error',
        duration: 456,
    })
    expect(onResult).toBeCalledWith({type: 'result', node: testfunc, result: expect.objectContaining({type: 'fail'})})
})

test('throw error when reporting result on group', async () => {
    const {suite} = setupRunningSuite()
    TestGroup.create(suite, 1, 'foo', 'ident')

    expect(() => getSuiteReporter(suite).result({nodeId: 1, type: TestResultType.skipped})).toThrow('Can not add result')
})

test('report coverage', async () => {
    const {suite} = setupRunningSuite()
    const onComplete = mock.fn()
    suite.addListener('complete', onComplete)
    const coverage: CoverageMapData = {}

    getSuiteReporter(suite).complete({coverage})

    expect(suite.coverage).toBe(coverage)
    expect(onComplete).toBeCalledWith({type: 'complete', node: suite})
})

describe('collect index', () => {
    function setupDummyRunStack() {
        const { conductor: conductorA } = setupDummyConductor('A')
        const { conductor: conductorB } = setupDummyConductor('B')
        const runStack = createTestRun([conductorA, conductorB], [
            {url: 'test://foo.js', title: 'foo'},
            {url: 'test://bar.js', title: 'bar'},
            {url: 'test://baz.js', title: 'baz'},
        ])
        const runA = runStack.runs.get(conductorA)!
        const runB = runStack.runs.get(conductorB)!
        const suiteAFoo = runA.suites.get('test://foo.js')!
        const suiteBFoo = runB.suites.get('test://foo.js')!
        const nodeData: TestNodeData[] = [
            {id: 1, title: 'group A', children: [
                {id: 2, title: 'test A'},
                {id: 3, title: 'test B'},
            ]},
            {id: 4, title: 'group B', children: [
                {id: 5, title: 'test C'},
            ]},
        ]
        createTestElements(suiteAFoo, nodeData)
        createTestElements(suiteBFoo, nodeData)
        createTestElements(suiteBFoo, [{id: 6, title: 'test D'}])

        return {
            runStack,
            conductorA,
            conductorB,
            runA,
            runB,
            suiteAFoo,
            suiteBFoo,
        }
    }

    test('suites', () => {
        const { runStack, runA, suiteAFoo } = setupDummyRunStack()

        expect(runA.index.suites.pending.size).toBe(3)
        expect(runStack.index.suites.pending.size).toBe(6)
        setSuiteState(suiteAFoo, TestRunState.done)

        expect(suiteAFoo.state).toBe(TestRunState.done)
        expect(runA.index.suites.pending.size).toBe(2)
        expect(runA.index.suites.done.size).toBe(1)
        expect(runStack.index.suites.pending.size).toBe(5)
        expect(runStack.index.suites.done.size).toBe(1)
    })

    test('tests', async () => {
        const { runStack, runA, runB, suiteAFoo, suiteBFoo } = setupDummyRunStack()

        expect(runStack.index.tests.size).toBe(4)
        expect(runA.index.tests.size).toBe(3)
        expect(runB.index.tests.size).toBe(4)

        getTestFunction(suiteAFoo, 2).result.set(new TestResult(TestResultType.success))

        expect(suiteAFoo.index.results.success.size).toBe(1)
        expect(runStack.index.results.success.size).toBe(1)

        getTestFunction(suiteBFoo, 2).result.set(new TestResult(TestResultType.success))

        expect(suiteBFoo.index.results.success.size).toBe(1)
        expect(runStack.index.results.success.size).toBe(1)

        getTestFunction(suiteAFoo, 3).result.set(new TestResult(TestResultType.timeout))
        expect(suiteAFoo.index.results.timeout.size).toBe(1)
        expect(runStack.index.results.timeout.size).toBe(1)

        getTestFunction(suiteBFoo, 3).result.set(new TestResult(TestResultType.fail))

        expect(suiteBFoo.index.results.fail.size).toBe(1)
        expect(runStack.index.results.timeout.size).toBe(0)
        expect(runStack.index.results.MIXED.size).toBe(1)

        getTestFunction(suiteBFoo, 6).result.set(new TestResult(TestResultType.skipped))

        expect(suiteAFoo.index.results.skipped.size).toBe(0)
        expect(suiteBFoo.index.results.skipped.size).toBe(1)
        expect(runStack.index.results.skipped.size).toBe(1)

    })

    test('errors', async () => {
        const { runStack, suiteAFoo, suiteBFoo } = setupDummyRunStack()

        getTestGroup(suiteAFoo, 1).errors.add(new TestError('foo'))
        getTestGroup(suiteAFoo, 4).errors.add(new TestError('foo'))
        getTestGroup(suiteBFoo, 4).errors.add(new TestError('foo'))

        expect(suiteAFoo.index.errors.size).toBe(2)
        expect(suiteBFoo.index.errors.size).toBe(1)
        expect(runStack.index.errors.size).toBe(2)
    })
})

test('provide aggregated result on `TestFunctionStack`', async () => {
    const { conductor: conductorA } = setupDummyConductor('A')
    const { conductor: conductorB } = setupDummyConductor('B')
    const runStack = createTestRun([conductorA, conductorB], [
        {url: 'test://foo.js', title: 'foo'},
    ])
    const suiteA = runStack.runs.get(conductorA)!.suites.get('test://foo.js')!
    const suiteB = runStack.runs.get(conductorB)!.suites.get('test://foo.js')!
    setSuiteState(suiteA, TestRunState.running)
    setSuiteState(suiteB, TestRunState.running)

    expect(runStack.suites.get('test://foo.js')!.children.size).toBe(0)

    const funcA = TestFunction.create(suiteA, 1, 'some test', 'some test')
    const functionStack = funcA.stack

    expect(funcA.result.get()).toBe(undefined)
    expect(runStack.suites.get('test://foo.js')!.children.size).toBe(1)
    expect(functionStack.resultType).toBe(undefined)

    funcA.result.set(new TestResult(TestResultType.success))
    expect(funcA.result.get()).toEqual({type: TestResultType.success})
    expect(functionStack.resultType).toBe(TestResultType.success)

    const funcB = TestFunction.create(suiteB, 1, 'some test', 'some test')

    expect(funcB.result.get()).toBe(undefined)
    expect(funcB.stack).toBe(functionStack)
    expect(functionStack.resultType).toBe(TestResultType.success)

    funcB.result.set(new TestResult(TestResultType.fail))
    expect(funcB.result.get()).toEqual({type: TestResultType.fail})
    expect(functionStack.resultType).toBe('MIXED')

    expect(runStack.index.results.MIXED.size).toBe(1)
    expect(runStack.index.results.success.size).toBe(0)
})
