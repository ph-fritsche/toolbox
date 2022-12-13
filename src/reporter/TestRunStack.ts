import { TestRun } from './TestRun'
import { Entity } from '../test'
import { Test } from './Test'
import { TestGroup } from './TestGroup'
import { TestNodeStack } from './TestNodeStack'

export class TestRunStack extends Entity implements PromiseLike<void> {
    constructor(
        testRuns: TestRun[],
    ) {
        super()
        this.testRuns = new Set(testRuns)
        for (const run of testRuns) {
            Object.defineProperty(run, 'stack', {
                configurable: true,
                get: () => this,
            })
        }
        this.done = new Promise(async r => {
            await Promise.allSettled(testRuns.map(r => r.onDone()))
            r()
        })
    }
    protected readonly testRuns: Set<TestRun>
    protected readonly done: Promise<void>

    get runs() {
        return Array.from(this.testRuns.values())
    }

    get isDone() {
        for (const run of this.testRuns.values()) {
            if (run.state !== 'done') {
                return false
            }
        }
        return true
    }

    aggregateNodes() {
        const main = new TestNodeStack([undefined, new TestGroup({ title: '#main' })])
        const nodemap = new Map<TestGroup | Test, TestNodeStack>()

        for (const run of this.testRuns.values()) {
            for (const suite of run.suites.values()) {
                nodemap.set(suite, main.addChild(run, suite))
                for (const { parent, node } of this.traverseNodes(suite)) {
                    nodemap.set(node, nodemap.get(parent).addChild(run, node))
                }
            }
        }

        return main.children
    }

    protected *traverseNodes(
        node: TestGroup | Test,
    ): Generator<{ parent: TestGroup, node: TestGroup | Test }> {
        if ('children' in node) {
            for (const c of node.children) {
                yield { parent: node, node: c }
                yield* this.traverseNodes(c)
            }
        }
    }

    get then() {
        return this.done.then.bind(this.done)
    }
}
