import { TestConductor } from '#src/conductor/TestConductor'
import { TestReporter } from '#src/conductor/TestReporter'
import { TestRunState, TestSuite } from '#src/conductor/TestRun'
import { TestFunction } from '#src/conductor/TestRun/TestFunction'
import { TestGroup } from '#src/conductor/TestRun/TestGroup'
import { TestRunStack } from '#src/conductor/TestRun/TestRun'
import { AbortablePromise, AbortablePromiseExecutor } from '#src/util/AbortablePromise'

export function setupDummyConductor(title = 'Dummy', setupFiles: URL[] = []) {
    const runTestSuiteExecutor = mock.fn<(this: {suiteUrl: string, filter?: RegExp}, ...rest: Parameters<AbortablePromiseExecutor<void>>) => void>((res, rej) => rej(undefined))
    const runTestSuite = mock.fn<TestConductor['runTestSuite']>((reporter, suiteUrl, filter, abortController = new AbortController()) => new AbortablePromise(abortController, runTestSuiteExecutor.bind({
        suiteUrl,
        filter,
    })))
    class DummyTestConductor extends TestConductor {
        readonly runTestSuite = runTestSuite
    }

    return {
        conductor: new DummyTestConductor(title, setupFiles) as TestConductor,
        runTestSuite,
        runTestSuiteExecutor,
    }
}

export function setupDummySuite() {
    const dummyConductor = setupDummyConductor()

    const run = TestRunStack.create([dummyConductor.conductor], [{url: 'test://dummy.js', title: 'Dummy Suite'}])
    const suite = run.suites.get('test://dummy.js')!.instances.values().next().value as TestSuite

    return {
        ...dummyConductor,
        suite,
    }
}

export function setSuiteState(suite: TestSuite, state: TestRunState) {
    Reflect.set(suite, 'state', state, suite)
}

export function setupRunningSuite() {
    const dummySuite = setupDummySuite()

    setSuiteState(dummySuite.suite, TestRunState.running)

    return dummySuite
}

export function getSuiteReporter(suite: TestSuite) {
    return Reflect.get(suite, 'getReporter', suite).call(suite) as TestReporter
}

export function getTestFunction(suite: TestSuite, nodeId: number) {
    const n = suite.nodes.get(nodeId)
    if (!(n instanceof TestFunction)) {
        throw new Error(`Expected node #${nodeId} to be TestFunction`)
    }
    return n
}

export function getTestGroup(suite: TestSuite, nodeId: number) {
    const n = suite.nodes.get(nodeId)
    if (!(n instanceof TestGroup)) {
        throw new Error(`Expected node #${nodeId} to be TestGroup`)
    }
    return n
}
