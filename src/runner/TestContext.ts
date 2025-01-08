import { TestFunction, TestCallback, TestGroup, BeforeCallback, AfterCallback, TestSuite } from './TestNode'
import { vsprintf } from './sprintf'

type TestGroupDeclare<Args extends unknown[] = []> = (this: TestGroup, ...args: Args) => void

export type TestContext = ReturnType<typeof setTestContext>

export function setTestContext(on: object, context: TestSuite|TestGroup) {
    const describe = (
        title: string,
        declare: TestGroupDeclare,
    ) => {
        const group = new TestGroup(context, title)
        setTestContext(on, group)
        declare.call(group)
        setTestContext(on, context)
    }
    describe.each = <Args>(cases: Iterable<Args>) => (
        title: string,
        declare: TestGroupDeclare<Args extends (unknown[] | readonly unknown[]) ? [...Args] : [Args]>,
    ) => {
        for (const args of cases) {
            const argsArray = (Array.isArray(args) ? args : [args]) as Args extends (unknown[] | readonly unknown[]) ? [...Args] : [Args]
            describe(
                vsprintf(title, argsArray),
                function(this: TestGroup) {
                    declare.apply(this, argsArray)
                },
            )
        }
    }

    const test = (
        title: string,
        callback: TestCallback,
        timeout?: number,
    ) => {
        const error = new Error()
        const getErrorCallStack = async () => {
            return error.stack?.split('\n').slice(2).join('\n')
        }

        new TestFunction(
            context,
            title,
            callback,
            timeout,
            getErrorCallStack,
        )
    }
    test.each = <Args>(cases: Iterable<Args>) => {
        const error = new Error()
        const getErrorCallStack = async () => {
            return error.stack?.split('\n').slice(2).join('\n')
        }

        return (
            title: string,
            cb: TestCallback<Args extends (unknown[] | readonly unknown[]) ? [...Args] : [Args]>,
            timeout?: number,
        ) => {
            for (const args of cases) {
                const argsArray = (Array.isArray(args) ? args : [args]) as (Args extends (unknown[] | readonly unknown[]) ? [...Args] : [Args])
                new TestFunction(
                    context,
                    vsprintf(title, argsArray),
                    function(this: TestFunction) {
                        return cb.apply(this, argsArray)
                    },
                    timeout,
                    getErrorCallStack,
                )
            }
        }
    }

    const beforeAll = (cb: BeforeCallback) => {
        context.beforeAll.push(cb)
    }
    const beforeEach = (cb: BeforeCallback) => {
        context.beforeEach.push(cb)
    }
    const afterAll = (cb: AfterCallback) => {
        context.afterAll.push(cb)
    }
    const afterEach = (cb: AfterCallback) => {
        context.afterEach.push(cb)
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
