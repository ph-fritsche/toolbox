import { TestGroup as BaseTestGroup } from '../test/TestGroup'
import { Test } from './Test'
import { TestError } from './TestError'

export type BeforeCallback = (this: TestGroup) => void | AfterCallback | Promise<void | AfterCallback>

export type AfterCallback = (this: TestGroup) => void | Promise<void>

export type BeforeCallbackReturn = {
    fn: AfterCallback
    per: BeforeCallback
}

export class TestGroup extends BaseTestGroup {
    declare readonly parent?: TestGroup

    declare protected _children: Array<TestGroup | Test>
    get children() {
        return [...this._children]
    }

    constructor(
        props: ConstructorParameters<typeof BaseTestGroup>[0] & {
            parent?: TestGroup
        },
    ) {
        super(props)
        this.parent = props.parent
    }

    private beforeAllCallbacks: BeforeCallback[] = []
    addBeforeAll(cb: BeforeCallback) {
        this.beforeAllCallbacks.push(cb)
    }
    runBeforeAll() {
        return this.runBefore(undefined, this.beforeAllCallbacks)
    }

    private beforeEachCallbacks: BeforeCallback[] = []
    addBeforeEach(cb: BeforeCallback) {
        this.beforeEachCallbacks.push(cb)
    }
    runBeforeEach(test: Test) {
        return this.runBefore(test, this.beforeEachCallbacks)
    }

    private afterAllCallbacks: AfterCallback[] = []
    addAfterAll(cb: AfterCallback) {
        this.afterAllCallbacks.push(cb)
    }
    runAfterAll(perBefore: BeforeCallbackReturn[]) {
        return this.runAfter(undefined, this.afterAllCallbacks, perBefore)
    }

    private afterEachCallbacks: AfterCallback[] = []
    addAfterEach(cb: AfterCallback) {
        this.afterEachCallbacks.push(cb)
    }
    runAfterEach(test: Test, perBefore: BeforeCallbackReturn[]) {
        return this.runAfter(test, this.afterEachCallbacks, perBefore)
    }

    private async runBefore(
        test: Test | undefined,
        stack: BeforeCallback[],
    ) {
        const after: BeforeCallbackReturn[] = []
        const errors: TestError[] = []
        for (const fn of stack) {
            try {
                const a: Awaited<ReturnType<BeforeCallback>> = await fn.call(this)
                if (a) {
                    after.push({fn: a, per: fn})
                }
            } catch (e) {
                const type = test ? 'Each' : 'All'
                const hook = `before${type} (${fn.name})`
                const reason = e instanceof Error ? e : String(e)
                errors.push(new TestError(this, hook, reason, test))
            }
        }
        return {after, errors}
    }
    private async runAfter(
        test: Test | undefined,
        stack: AfterCallback[],
        beforeStack: BeforeCallbackReturn[],
    ) {
        const errors: TestError[] = []
        for (const s of [stack, beforeStack]) {
            for (const e of s) {
                const { fn, per } = typeof e === 'function'
                    ? { fn: e, per: undefined}
                    : e
                try {
                    await fn.call(this)
                } catch (e) {
                    const type = test ? 'Each' : 'All'
                    const suffix = s === stack ? '' : ` (per before${type}:${per?.name || 'anonymous'})`
                    const hook = `after${type}:${fn.name || 'anonymous'}${suffix}`
                    const reason = e instanceof Error ? e : String(e)
                    errors.push(new TestError(this, hook, reason, test))
                }
            }
        }
        return {errors}
    }

    addChild(child: TestGroup | Test) {
        this._children.push(child)
    }
}
