import { TestNodeInstance, TestNodeStack, TestRunStack } from './TestRun'

export const TestRunIterator = {
    ancestors: function* <T extends TestNodeInstance|TestNodeStack>(
        node: T,
    ) {
        for (let el: T|undefined = node; el; el = el.parent as T|undefined) {
            yield el
        }
    },
    stackTree: function* (
        nodes: Iterable<TestNodeStack>,
    ): Generator<TestNodeStack> {
        for (const n of nodes) {
            yield n
            if (n.children) {
                yield* this.stackTree(n.children.values())
            }
        }
    },
    instanceTree: function* (
        nodes: Iterable<TestNodeInstance>,
    ): Generator<TestNodeInstance> {
        for (const n of nodes) {
            yield n
            if (n.children) {
                yield* this.instanceTree(n.children.values())
            }
        }
    },
    iterateSuitesByConductors: function* (
        runStack: TestRunStack,
    ) {
        for (const r of runStack.runs.values()) {
            for (const s of r.suites.values()) {
                yield s
            }
        }
    },
    iterateConductorsBySuites: function* (
        runStack: TestRunStack,
    ) {
        for (const s of runStack.suites.values()) {
            for (const r of s.instances.values()) {
                yield r
            }
        }
    },
}
