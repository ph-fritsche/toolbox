import { TestContext } from '#src'
import { setTestContext, TestGroup } from '#src/runner'
import { Test } from '#src/runner/Test'
import jest from 'jest-mock'

function setupTestContext() {
    const context = {} as TestContext
    const main = new TestGroup({title: '#test'})

    setTestContext(context, main)

    return {
        context,
        main,
    }
}

test('declare `test`', async () => {
    const {context, main} = setupTestContext()
    const callback = () => void 0

    context.test('some test', callback)

    expect(main.children.length).toBe(1)
    expect(main.children[0]).toHaveProperty('title', 'some test')
    expect(main.children[0]).toHaveProperty('callback', callback)
})

test('declare `describe`', () => {
    const {context, main} = setupTestContext()
    const callback = () => void 0

    context.describe('some group', () => {
        context.test('some test', callback)
    })

    expect(main.children.length).toBe(1)
    expect(main.children[0]).toHaveProperty('title', 'some group')
    expect(main.children[0]).toHaveProperty('children', expect.any(Array))

    expect((main.children[0] as TestGroup).children.length).toBe(1)
    expect((main.children[0] as TestGroup).children[0]).toHaveProperty('title', 'some test')
    expect((main.children[0] as TestGroup).children[0]).toHaveProperty('callback', callback)
})

test('declare `test.each`', () => {
    const {context, main} = setupTestContext()
    const callback = jest.fn<() => void>()

    context.test.each(['a', 'b', 'c'])('some test: %s', callback)

    expect(main.children.length).toBe(3)
    expect(main.children[1]).toHaveProperty('title', 'some test: b')
    expect(main.children[1]).toHaveProperty('callback', expect.any(Function))

    void (main.children[1] as Test).callback()

    expect(callback).toHaveBeenCalledWith('b')
})

test('declare `describe.each`', () => {
    const {context, main} = setupTestContext()
    const callback = jest.fn<() => void>()

    context.describe.each([['a', 'b'], ['c', 'd']])('some group: %s %s', (x, y) => {
        context.test(`${x},${y}`, callback)
    })

    expect(main.children.length).toBe(2)
    expect(main.children[0]).toHaveProperty('title', 'some group: a b')
    expect(main.children[0]).toHaveProperty('children', expect.any(Array))

    expect((main.children[1] as TestGroup).children.length).toBe(1)
    expect((main.children[1] as TestGroup).children[0]).toHaveProperty('title', 'c,d')
    expect((main.children[1] as TestGroup).children[0]).toHaveProperty('callback', callback)
})

test('declare hooks', async() => {
    const {context, main} = setupTestContext()
    const callback = () => void 0

    context.afterAll(callback)
    expect(Reflect.get(main, 'afterAllCallbacks')).toEqual([callback])

    context.afterEach(callback)
    expect(Reflect.get(main, 'afterEachCallbacks')).toEqual([callback])

    context.beforeEach(callback)
    expect(Reflect.get(main, 'beforeEachCallbacks')).toEqual([callback])

    context.beforeAll(callback)
    expect(Reflect.get(main, 'beforeAllCallbacks')).toEqual([callback])
})
