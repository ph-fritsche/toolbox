import { isTestGroup, isTestSuite, TestNodeStack, TestRunInstance, TestSuiteStack } from '../../conductor/TestRun'
import { TestGroupStack } from '../../conductor/TestRun/TestGroup'

export function findNodeFrom<F extends (n: TestNodeStack) => boolean>(
    node: TestNodeStack,
    reverse: boolean,
    predicate: F,
) {
    for(let n = node;;) {
        n = reverse ? n.previousNode : n.nextNode
        if (n === node) {
            return undefined
        } else if (predicate(n)) {
            return n as TestNodeStack & (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                F extends ((a: any) => a is infer T) ? T : unknown
            )
        }
    }
}

export function hasError(
    node: TestNodeStack,
    run?: TestRunInstance,
): node is TestGroupStack|TestSuiteStack {
    for (const [r, n] of node.instances) {
        if (run && run !== r) {
            continue
        }
        if (isTestGroup(n) || isTestSuite(n)) {
            if (n.errors.count) {
                return true
            }
        }
    }
    return false
}
