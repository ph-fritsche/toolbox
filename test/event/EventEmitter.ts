import { createEventEmitter } from '#src/event'
import { immediate } from '#test/_util'

test('dispatch events', async () => {
    const listenerA = mock.fn()
    const listenerB = mock.fn()

    const [emitter, dispatch] = createEventEmitter<{dummy: {foo: string}}>()

    emitter.addListener('dummy', listenerA)
    emitter.addListener('dummy', listenerB)
    dispatch('dummy', {foo: 'bar'})

    await immediate()

    expect(listenerA).toBeCalledTimes(1)
    expect(listenerA).toBeCalledWith({type: 'dummy', foo: 'bar'})
    expect(listenerB).toBeCalledTimes(1)
    expect(listenerB).toBeCalledWith({type: 'dummy', foo: 'bar'})
})

test('dispatch events on parent', async () => {
    const listenerA = mock.fn()
    const listenerB = mock.fn()

    const [emitterA] = createEventEmitter<{dummy: {foo: string}}>()
    const [emitterB, dispatch] = createEventEmitter<{dummy: {foo: string}}>(emitterA)

    emitterA.addListener('dummy', listenerA)
    emitterB.addListener('dummy', listenerB)
    dispatch('dummy', {foo: 'bar'})

    await immediate()

    expect(listenerB).toBeCalledTimes(1)
    expect(listenerA).toBeCalledTimes(1)
    expect(listenerA).toBeCalledWith({type: 'dummy', foo: 'bar'})
})

test('remove listeners', async () => {
    const listenerA = mock.fn()
    const listenerB = mock.fn()

    const [emitter, dispatch] = createEventEmitter<{dummy: object}>()
    emitter.addListener('dummy', listenerA)
    const removeB = emitter.addListener('dummy', listenerB)

    dispatch('dummy', {})
    await immediate()

    emitter.removeListener('dummy', listenerA)
    dispatch('dummy', {})
    await immediate()

    removeB()
    dispatch('dummy', {})
    await immediate()

    expect(listenerA).toBeCalledTimes(1)
    expect(listenerB).toBeCalledTimes(2)
})
