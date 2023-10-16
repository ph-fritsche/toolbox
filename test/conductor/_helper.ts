import { TestConductor } from '#src/conductor/TestConductor'
import { TestReporter } from '#src/conductor/TestReporter'
import { TestSuite } from '#src/conductor/TestRun'
import { TestFunction } from '#src/conductor/TestRun/TestFunction'
import { TestGroup } from '#src/conductor/TestRun/TestGroup'
import { TestRunStack } from '#src/conductor/TestRun/TestRun'

export function setupDummyConductor(title = 'Dummy', setupFiles: URL[] = []) {
    const runTestSuite = mock.fn<TestConductor['runTestSuite']>(async () => void 0)
    class DummyTestConductor extends TestConductor {
        readonly runTestSuite = runTestSuite
    }

    return {
        conductor: new DummyTestConductor(title, setupFiles) as TestConductor,
        runTestSuite,
    }
}

export function setupDummySuite() {
    const run = TestRunStack.create([setupDummyConductor().conductor], [{url: 'test://dummy.js', title: 'Dummy Suite'}])
    const suite = run.suites.get('test://dummy.js')!.instances.values().next().value
    return suite as TestSuite
}

export function setupRunningSuite() {
    const suite = setupDummySuite()
    Object.defineProperty(suite, '_state', {value: 'running'})
    return suite
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
