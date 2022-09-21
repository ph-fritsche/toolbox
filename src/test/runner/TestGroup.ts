import type { Test } from './Test'

export type BeforeCallback = (this: TestGroup) => void | AfterCallback | Promise<void | AfterCallback>

export type AfterCallback = (this: TestGroup) => void | Promise<void>

type TestsIteratorNodeShared = {include: boolean}
export type TestsIteratorTestNode = TestsIteratorNodeShared & {element: Test}
export type TestsIteratorGroupNode = TestsIteratorNodeShared & {element: TestGroup} & Iterable<TestsIteratorNode>
export type TestsIteratorNode = TestsIteratorTestNode | TestsIteratorGroupNode

export class TestGroup {
    constructor(
        title: string,
        parent?: TestGroup,
    ) {
        this.title = title
        this.parent = parent
    }
    readonly title: string
    readonly parent?: TestGroup

    private beforeAllCallbacks: BeforeCallback[] = []
    addBeforeAll(cb: BeforeCallback) {
        this.beforeAllCallbacks.push(cb)
    }
    runBeforeAll() {
        return this.runBefore(this.beforeAllCallbacks)
    }

    private beforeEachCallbacks: BeforeCallback[] = []
    addBeforeEach(cb: BeforeCallback) {
        this.beforeEachCallbacks.push(cb)
    }
    runBeforeEach() {
        return this.runBefore(this.beforeEachCallbacks)
    }

    private afterAllCallbacks: AfterCallback[] = []
    addAfterAll(cb: AfterCallback) {
        this.afterAllCallbacks.push(cb)
    }
    runAfterAll(callbacks: AfterCallback[]) {
        return this.runAfter(...this.afterAllCallbacks, ...callbacks)
    }

    private afterEachCallbacks: AfterCallback[] = []
    addAfterEach(cb: AfterCallback) {
        this.afterEachCallbacks.push(cb)
    }
    runAfterEach(callbacks: AfterCallback[]) {
        return this.runAfter(...this.afterEachCallbacks, ...callbacks)
    }

    private async runBefore(stack: BeforeCallback[]) {
        const after: AfterCallback[] = []
        for (const fn of stack) {
            const a = await fn.call(this)
            if (a) {
                after.push(a)
            }
        }
        return after
    }
    private async runAfter(...stack: AfterCallback[]) {
        for (const fn of stack) {
            await fn.call(this)
        }
    }

    private _children: Array<TestGroup | Test> = []
    addChild(child: TestGroup | Test) {
        this._children.push(child)
    }

    tests(
        filter?: (item: TestGroup|Test) => boolean,
    ): TestsIteratorGroupNode {
        const hitSelf = filter?.(this)
        const elements = this._children.map(child => {
            if (child instanceof TestGroup) {
                return child.tests(hitSelf ? undefined : filter)
            } else {
                return {element: child, include: hitSelf || !filter || filter(child)}
            }
        })
        const include = elements.some(el => el.include)

        return {
            *[Symbol.iterator]() {
                yield* elements
            },
            element: this,
            include,
        }
    }
}
