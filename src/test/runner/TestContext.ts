import { Test, TestCallback } from './Test'
import { AfterCallback, BeforeCallback, TestGroup } from './TestGroup'
import { vsprintf } from './sprintf'

type TestGroupDeclare<Args = []> = (
    this: TestGroup,
    ...args: Args extends unknown[] ? Args : [Args]
) => void

export type TestContext = ReturnType<typeof setTestContext>

export function setTestContext(on: {}, context: TestGroup) {
    const describe = (
        title: string,
        declare: TestGroupDeclare,
    ) => {
        const group = new TestGroup({
            title,
            parent: context,
            children: [],
        })
        context.addChild(group)
        setTestContext(on, group)
        declare.call(group)
        setTestContext(on, context)
    }
    describe.each = <Args>(cases: Iterable<Args>) => (
        title: string,
        declare: TestGroupDeclare<Args>,
    ) => {
        for (const args of cases) {
            const argsArray = Array.isArray(args) ? args : [args]
            describe(
                vsprintf(title, argsArray),
                function(this: TestGroup) {
                    return declare.apply(this, argsArray)
                },
            )
        }
    }
    const test = (
        title: string,
        callback: TestCallback,
        timeout?: number,
    ) => {
        context.addChild(new Test({
            title,
            parent: context,
            callback,
            timeout,
        }))
    }
    test.each = <Args>(cases: Iterable<Args>) => (
        title: string,
        cb: TestCallback<Args extends unknown[] ? Args : [Args]>,
        timeout?: number,
    ) => {
        for (const args of cases) {
            const argsArray = Array.isArray(args) ? args : [args]
            context.addChild(new Test({
                title: vsprintf(title, argsArray),
                parent: context,
                callback: function(this: Test) {
                    return cb.apply(this, argsArray)
                },
                timeout,
            }))
        }
    }
    const beforeAll = (cb: BeforeCallback) => {
        context.addBeforeAll(cb)
    }
    const beforeEach = (cb: BeforeCallback) => {
        context.addBeforeEach(cb)
    }
    const afterAll = (cb: AfterCallback) => {
        context.addAfterAll(cb)
    }
    const afterEach = (cb: AfterCallback) => {
        context.addAfterEach(cb)
    }

    const testContextMethods = {
        describe,
        test,
        beforeAll,
        beforeEach,
        afterAll,
        afterEach,
    }
    Object.entries(testContextMethods).forEach(([binding, fn]) => {
        Object.defineProperty(on, binding, {
            configurable: true,
            get: () => fn,
        })
    })

    return testContextMethods
}
