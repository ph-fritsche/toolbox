import { ResolvedValue } from '#src/util/ResolvedValue'

test('resolve value', async () => {
    const resolved = new ResolvedValue('foo')
    const listener = mock.fn()
    const resolver = mock.fn(async () => 'bar')
    const secondResolver = mock.fn(async () => 'baz')

    expect(resolved.get()).toBe('foo')

    resolved.onResolve(listener)

    resolved.resolve(resolver)
    resolved.resolve(secondResolver)

    await new Promise(r => setTimeout(r))

    expect(listener).toBeCalledTimes(1)
    expect(listener).toBeCalledWith('bar')

    expect(secondResolver).not.toBeCalled()

    expect(resolved.get()).toBe('bar')
})
