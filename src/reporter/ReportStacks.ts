import { createHash } from 'crypto'
import { TestConductor } from '../conductor/TestConductor'
import { Test } from '../test/Test'
import { TestGroup } from '../test/TestGroup'
import { TestRun } from '../conductor/TestRun'

export class ReportStacks {
    protected readonly runHash = new Map<TestRun, string>()
    protected readonly runStack = new Map<string, Map<TestConductor, TestRun>>()

    protected makeHash(
        data: string[]
    ) {
        const h = createHash('sha256')
        data.forEach(f => h.update(f))

        return h.digest('base64')
    }

    makeStack(
        testRun: TestRun,
        hashParams: string[],
    ) {
        const hash = this.makeHash(hashParams)
        this.runHash.set(testRun, hash)
        if (!this.runStack.has(hash)) {
            this.runStack.set(hash, new Map())
        }
        this.runStack.get(hash).set(testRun.conductor, testRun)
    }

    getStack(
        testRun: TestRun,
    ) {
        const hash = this.runHash.get(testRun)
        return this.runStack.has(hash)
            ? this.runStack.get(hash)
            : new Map<undefined, TestRun>([[undefined, testRun]])
    }

    aggregateResults(
        stack: Map<TestConductor, TestRun>,
    ) {
        const main = new TestNodeStack(new TestGroup({title: '#main'}))
        const nodemap = new Map<TestGroup|Test, TestNodeStack>()

        for (const [conductor, run] of stack) {
            for (const suite of run.groups.values()) {
                for (const {parent, node} of this.traverseNodes(suite)) {
                    if (!nodemap.has(parent)) {
                        nodemap.set(parent, main.addChild(parent))
                    }
                    nodemap.set(node, nodemap.get(parent).addChild(node))
                }
            }
        }

        return main.children.sort(sortTestNode)
    }

    protected *traverseNodes(
        node: TestGroup|Test,
    ): Generator<{parent: TestGroup, node: TestGroup|Test}> {
        if ('children' in node) {
            for (const c of node.children) {
                yield {parent: node, node: c}
                yield* this.traverseNodes(c)
            }
        }
    }
}

function sortTestNode<T extends TestGroup|Test|TestNodeStack>(
    a: T,
    b: T,
) {
    return a.title === b.title ? 0 : a.title < b.title ? -1 : 1
}

export class TestNodeStack<T extends TestGroup|Test = TestGroup|Test> {
    constructor(
        ...items: [T, ...T[]]
    ) {
        this.stack = new Set(items)
        this.type = 'children' in items[0] ? 'group' : 'test'
        this.title = items[0].title
    }

    readonly title: string
    protected type: 'group'|'test'
    protected stack = new Set<T>()
    protected _children = new Set<TestNodeStack<TestGroup|Test>>()

    addInstance(
        node: T
    ) {
        this.stack.add(node)
    }

    getInstances() {
        return Array.from(this.stack)
    }

    isGroup(): this is TestNodeStack<TestGroup> {
        return this.type === 'group'
    }

    get children() {
        return (this.type === 'group'
            ? Array.from(this._children).sort(sortTestNode)
            : void 0
        ) as T extends TestGroup ? TestNodeStack<TestGroup | Test>[] : never
    }

    addChild<C extends (T extends TestGroup ? TestGroup|Test : never)>(
        child: C,
    ): TestNodeStack<C> {
        const children = Array.from(this._children)
        const i = children.findIndex(el => el instanceof child.constructor && el.title === child.title)
        if (i < 0) {
            const s = new TestNodeStack(child)
            this._children.add(s)
            return s
        } else {
            children[i].addChild(child)
            return children[i] as TestNodeStack<C>
        }
    }
}
