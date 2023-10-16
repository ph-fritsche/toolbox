import { TestContext } from '#src'
import { setTestContext } from '#src/runner/TestContext'
import { TestFunction, TestGroup, TestSuite } from '#src/runner/TestNode'

function setupTestContext() {
    const context = {} as TestContext
    const suite = new TestSuite()

    setTestContext(context, suite)

    return {
        context,
        suite,
    }
}

test('declare `test`', async () => {
    const {context, suite} = setupTestContext()
    const callback = () => void 0

    context.test('some test', callback)

    expect(suite.children.length).toBe(1)
    expect(suite.children[0]).toHaveProperty('title', 'some test')
    expect(suite.children[0]).toHaveProperty('callback', callback)
})

test('declare `describe`', () => {
    const {context, suite} = setupTestContext()
    const callback = () => void 0

    context.describe('some group', () => {
        context.test('some test', callback)
    })

    expect(suite.children.length).toBe(1)
    expect(suite.children[0]).toHaveProperty('title', 'some group')
    expect(suite.children[0]).toHaveProperty('children', expect.any(Array))

    expect((suite.children[0] as TestGroup).children.length).toBe(1)
    expect((suite.children[0] as TestGroup).children[0]).toHaveProperty('title', 'some test')
    expect((suite.children[0] as TestGroup).children[0]).toHaveProperty('callback', callback)
})

test('declare `test.each`', () => {
    const {context, suite} = setupTestContext()
    const callback = mock.fn<() => void>()

    context.test.each(['a', 'b', 'c'])('some test: %s', callback)

    expect(suite.children.length).toBe(3)
    expect(suite.children[1]).toHaveProperty('title', 'some test: b')
    expect(suite.children[1]).toHaveProperty('callback', expect.any(Function))

    void (suite.children[1] as TestFunction).callback()

    expect(callback).toHaveBeenCalledWith('b')
})

test('declare `describe.each`', () => {
    const {context, suite} = setupTestContext()
    const callback = mock.fn<() => void>()

    context.describe.each([['a', 'b'], ['c', 'd']])('some group: %s %s', (x, y) => {
        context.test(`${x},${y}`, callback)
    })

    expect(suite.children.length).toBe(2)
    expect(suite.children[0]).toHaveProperty('title', 'some group: a b')
    expect(suite.children[0]).toHaveProperty('children', expect.any(Array))

    expect((suite.children[1] as TestGroup).children.length).toBe(1)
    expect((suite.children[1] as TestGroup).children[0]).toHaveProperty('title', 'c,d')
    expect((suite.children[1] as TestGroup).children[0]).toHaveProperty('callback', callback)
})

for (const hook of ['beforeAll', 'beforeEach', 'afterAll', 'afterEach'] as const) {
    test(`declare hook: ${hook}`, async() => {
        const {context, suite} = setupTestContext()
        const callback = () => void 0

        context[hook](callback)
        expect(suite[hook]).toEqual([callback])
    })
}
