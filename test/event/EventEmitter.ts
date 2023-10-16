import { createEventEmitter } from '#src/event'

test('dispatch events', () => {
    const listenerA = mock.fn()
    const listenerB = mock.fn()

    const [emitter, dispatch] = createEventEmitter<{dummy: {foo: string}}>()

    emitter.addListener('dummy', listenerA)
    emitter.addListener('dummy', listenerB)
    dispatch('dummy', {foo: 'bar'})

    expect(listenerA).toBeCalledTimes(1)
    expect(listenerA).toBeCalledWith({type: 'dummy', foo: 'bar'})
    expect(listenerB).toBeCalledTimes(1)
    expect(listenerB).toBeCalledWith({type: 'dummy', foo: 'bar'})
})

test('dispatch events on parent', () => {
    const listenerA = mock.fn()
    const listenerB = mock.fn()

    const [emitterA] = createEventEmitter<{dummy: {foo: string}}>()
    const [emitterB, dispatch] = createEventEmitter<{dummy: {foo: string}}>(emitterA)

    emitterA.addListener('dummy', listenerA)
    emitterB.addListener('dummy', listenerB)
    dispatch('dummy', {foo: 'bar'})

    expect(listenerB).toBeCalledTimes(1)
    expect(listenerA).toBeCalledTimes(1)
    expect(listenerA).toBeCalledWith({type: 'dummy', foo: 'bar'})
})

test('remove listeners', () => {
    const listenerA = mock.fn()
    const listenerB = mock.fn()

    const [emitter, dispatch] = createEventEmitter<{dummy: object}>()
    emitter.addListener('dummy', listenerA)
    const removeB = emitter.addListener('dummy', listenerB)

    dispatch('dummy', {})
    emitter.removeListener('dummy', listenerA)
    dispatch('dummy', {})
    removeB()
    dispatch('dummy', {})

    expect(listenerA).toBeCalledTimes(1)
    expect(listenerB).toBeCalledTimes(2)
})
