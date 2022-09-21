import { Test, TestCallback } from './Test'
import { AfterCallback, BeforeCallback, TestGroup } from './TestGroup'

type TestGroupDeclare<Args extends [] = []> = (this: TestGroup, ...args: Args) => void

export function setTestContext(on: {}, context: TestGroup) {
    const describe = (title: string, declare: TestGroupDeclare) => {
        const group = new TestGroup(title, this)
        context.addChild(group)
        setTestContext(on, group)
        declare.call(group)
        setTestContext(on, this)
    }
    describe.each = <Args extends []>(cases: Iterable<Args>) => (title: string, declare: TestGroupDeclare<Args>) => {
        for (const args of cases) {
            describe(title, function(this: TestGroup) {
                declare.apply(this, args)
            })
        }
    }
    const test = (title: string, cb: TestCallback) => {
        context.addChild(new Test(title, context, cb))
    }
    test.each = <Args extends []>(cases: Iterable<Args>) => (title: string, cb: TestCallback<Args>) => {
        for (const args of cases) {
            context.addChild(new Test(title, context, function(this: Test) {
                cb.apply(this, args)
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
    Object.entries({
        describe,
        test,
        beforeAll,
        beforeEach,
        afterAll,
        afterEach,
    }).forEach(([binding, fn]) => {
        Object.defineProperty(on, binding, {
            configurable: true,
            get: () => fn,
        })
    })
}
