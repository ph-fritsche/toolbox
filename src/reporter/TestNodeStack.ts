import type { Test } from './Test'
import type { TestGroup } from './TestGroup'
import type { TestRun } from './TestRun'
import type { TestError } from './TestError'
import type { TestResult } from './TestResult'

export class TestNodeStack<T extends TestGroup | Test = TestGroup | Test> {
    constructor(
        ...items: [[TestRun | undefined, T], ...[TestRun, T][]]
    ) {
        this.instances = new Map(items)
        this.type = 'children' in items[0][1] ? 'group' : 'test'
        this.title = items[0][1].title
    }

    readonly title: string
    readonly instances = new Map<TestRun | undefined, T>()
    protected type: 'group' | 'test'
    protected _children = new Set<TestNodeStack<TestGroup | Test>>()

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

    addChild<C extends (T extends TestGroup ? TestGroup | Test : never)>(
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
            if (run?.errors.has(instance.id)) {
                (run.errors.get(instance.id) as TestError[]).forEach(error => {
                    if (!errorMap.has(error.message)) {
                        errorMap.set(error.message, [])
                    }
                    (errorMap.get(error.message) as Array<[TestRun, TestError]>).push([run, error])
                })
            }
        })
        return errorMap
    }

    getResults() {
        const resultMap = new Map<TestResult['status'], [TestRun, TestResult][]>()
        this.instances.forEach((instance, run) => {
            if (run?.results.has(instance.id)) {
                const result = run.results.get(instance.id) as TestResult
                if (!resultMap.has(result.status)) {
                    resultMap.set(result.status, [])
                }
                (resultMap.get(result.status) as Array<[TestRun, TestResult]>).push([run, result])
            }
        })
        return resultMap
    }
}

function sortTestNode<T extends TestGroup | Test | TestNodeStack>(
    a: T,
    b: T,
) {
    return a.title === b.title ? 0 : a.title < b.title ? -1 : 1
}
