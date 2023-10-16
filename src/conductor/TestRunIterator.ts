import { TestNodeInstance, TestNodeStack, TestRunStack } from './TestRun'

export class TestRunIterator {
    static *ancestors<T extends TestNodeInstance|TestNodeStack>(
        node: T,
    ) {
        for (let el: T|undefined = node; el; el = el.parent as T|undefined) {
            yield el
        }
    }

    static *stackTree(
        nodes: Iterable<TestNodeStack>,
    ): Generator<TestNodeStack> {
        for (const n of nodes) {
            yield n
            if (n.children) {
                yield* this.stackTree(n.children.values())
            }
        }
    }

    static *instanceTree(
        nodes: Iterable<TestNodeInstance>,
    ): Generator<TestNodeInstance> {
        for (const n of nodes) {
            yield n
            if (n.children) {
                yield* this.instanceTree(n.children.values())
            }
        }
    }

    static *iterateSuitesByConductors(
        runStack: TestRunStack,
    ) {
        for (const r of runStack.runs.values()) {
            for (const s of r.suites.values()) {
                yield s
            }
        }
    }

    static *iterateConductorsBySuites(
        runStack: TestRunStack,
    ) {
        for (const s of runStack.suites.values()) {
            for (const r of s.instances.values()) {
                yield r
            }
        }
    }
}
