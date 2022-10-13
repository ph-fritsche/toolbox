import { TestGroup as BaseTestGroup, TestsIteratorGroupNode } from '../TestGroup'
import { Serializable } from '../types'
import { Test } from './Test'

export type BeforeCallback = (this: TestGroup) => void | AfterCallback | Promise<void | AfterCallback>

export type AfterCallback = (this: TestGroup) => void | Promise<void>

export class TestGroup extends BaseTestGroup {
    declare readonly parent?: TestGroup

    declare protected _children: Array<TestGroup | Test>
    get children() {
        return [...this._children]
    }

    constructor(
        props: Serializable<BaseTestGroup> & {
            parent?: TestGroup
        }
    ) {
        super(props)
    }

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

    addChild(child: TestGroup | Test) {
        this._children.push(child)
    }
}
