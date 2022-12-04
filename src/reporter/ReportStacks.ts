import { createHash } from 'crypto'
import { TestConductor } from '../conductor/TestConductor'
import { Test } from './Test'
import { TestGroup } from './TestGroup'
import { TestRun } from '../conductor/TestRun'
import { TestError } from './TestError'
import { TestResult } from './TestResult'

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
        const main = new TestNodeStack([undefined, new TestGroup({title: '#main'})])
        const nodemap = new Map<TestGroup|Test, TestNodeStack>()

        for (const [conductor, run] of stack) {
            for (const suite of run.groups.values()) {
                for (const {parent, node} of this.traverseNodes(suite)) {
                    if (!nodemap.has(parent)) {
                        nodemap.set(parent, main.addChild(run, parent))
                    }
                    nodemap.set(node, nodemap.get(parent).addChild(run, node))
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
        ...items: [[TestRun|undefined, T], ...[TestRun, T][]]
    ) {
        this.instances = new Map(items)
        this.type = 'children' in items[0][1] ? 'group' : 'test'
        this.title = items[0][1].title
    }

    readonly title: string
    readonly instances = new Map<TestRun|undefined, T>()
    protected type: 'group'|'test'
    protected _children = new Set<TestNodeStack<TestGroup|Test>>()

    isGroup(): this is TestNodeStack<TestGroup> {
        return this.type === 'group'
    }

    isTest(): this is TestNodeStack<Test> {
        return this.type === 'test'
    }

    get children() {
        return (this.type === 'group'
            ? Array.from(this._children).sort(sortTestNode)
            : void 0
        ) as T extends TestGroup ? TestNodeStack<TestGroup | Test>[] : never
    }

    addChild<C extends (T extends TestGroup ? TestGroup|Test : never)>(
        run: TestRun,
        child: C,
    ): TestNodeStack<C> {
        const children = Array.from(this._children)
        const i = children.findIndex(el => el.type === ('children' in child ? 'group' : 'test') && el.title === child.title)
        if (i < 0) {
            const s = new TestNodeStack([run, child])
            this._children.add(s)
            return s
        } else {
            children[i].instances.set(run, child)
            return children[i] as TestNodeStack<C>
        }
    }

    getErrors() {
        const errorMap = new Map<string, [TestRun, TestError][]>()
        this.instances.forEach((instance, run) => {
            if (run.errors.has(instance.id)) {
                run.errors.get(instance.id).forEach(error => {
                    if (!errorMap.has(error.message)) {
                        errorMap.set(error.message, [])
                    }
                    errorMap.get(error.message).push([run, error])
                })
            }
        })
        return errorMap
    }

    getResults() {
        const resultMap = new Map<TestResult['status'], [TestRun, TestResult][]>()
        this.instances.forEach((instance, run) => {
            if (run.results.has(instance.id)) {
                const result = run.results.get(instance.id)
                if (!resultMap.has(result.status)) {
                    resultMap.set(result.status, [])
                }
                resultMap.get(result.status).push([run, result])
            }
        })
        return resultMap
    }
}
