import FakeTimers from '@sinonjs/fake-timers'
import { Trigger } from '#src/util/Trigger'
import { promise } from '#src/util/promise'
import { observePromise } from '#test/_util'

const clock = FakeTimers.install()

function setupTrigger(debounce?: number) {
    const promises: ReturnType<typeof promise>[] = []
    const callback = mock.fn(() => {
        const r = promise()
        promises.push(r)
        return r.Promise
    })
    const trigger = new Trigger(callback, debounce)

    return {trigger, promises, callback}
}

test('activate trigger', async () => {
    const {trigger, callback, promises} = setupTrigger()

    const result = observePromise(trigger.activate())
    await clock.tickAsync(0)
    expect(callback).toBeCalledTimes(1)
    expect(Reflect.get(trigger, 'next')).toBe(undefined)
    expect(Reflect.get(trigger, 'current')).toBe(result.promise)
    expect(result.state).toBe('pending')

    promises[0].resolve('foo')
    await clock.tickAsync(0)
    expect(result.state).toBe('resolved')
    expect(await result.promise).toBe('foo')
    expect(Reflect.get(trigger, 'current')).toBe(undefined)
    expect(Reflect.get(trigger, 'next')).toBe(undefined)
})

test('enqueue trigger', async () => {
    const {trigger, callback, promises} = setupTrigger()

    const resultA = observePromise(trigger.activate())
    const resultB = observePromise(trigger.activate())
    expect(resultB.promise).toBe(resultA.promise)
    await clock.tickAsync(0)
    const resultC = observePromise(trigger.activate())
    await clock.tickAsync(0)
    expect(callback).toBeCalledTimes(1)
    expect(Reflect.get(trigger, 'current')).toBe(resultA.promise)
    expect(Reflect.get(trigger, 'next')).toBe(resultC.promise)
    // additional calls
    expect(trigger.activate()).toBe(resultC.promise)
    expect(trigger.activate()).toBe(resultC.promise)

    await clock.tickAsync(0)
    expect(callback).toBeCalledTimes(1)

    promises[0].resolve('foo')
    await clock.tickAsync(0)
    expect(Reflect.get(trigger, 'current')).toBe(resultC.promise)
    expect(Reflect.get(trigger, 'next')).toBe(undefined)
    expect(resultA.state).toBe('resolved')
    expect(resultC.state).toBe('pending')
    expect(callback).toBeCalledTimes(2)

    promises[1].reject('bar')
    await clock.tickAsync(0)
    expect(Reflect.get(trigger, 'current')).toBe(undefined)
    expect(Reflect.get(trigger, 'next')).toBe(undefined)
    expect(resultC.state).toBe('rejected')
})

test('debounce trigger', async () => {
    const {trigger, callback, promises} = setupTrigger(50)

    const resultA = observePromise(trigger.activate())
    const resultB = observePromise(trigger.activate())
    expect(Reflect.get(trigger, 'current')).toBe(undefined)
    expect(Reflect.get(trigger, 'next')).toBe(resultA.promise)
    expect(resultB.promise).toBe(resultA.promise)
    expect(callback).toBeCalledTimes(0)

    // After debounce the callback is called
    await clock.tickAsync(50)
    expect(Reflect.get(trigger, 'current')).toBe(resultA.promise)
    expect(Reflect.get(trigger, 'next')).toBe(undefined)
    expect(callback).toBeCalledTimes(1)

    // Enqueuing a second activation
    const resultC = observePromise(trigger.activate())
    expect(Reflect.get(trigger, 'current')).toBe(resultA.promise)
    expect(Reflect.get(trigger, 'next')).toBe(resultC.promise)

    // Additional calls return the enqueued promise
    await clock.tickAsync(100)
    const resultD = observePromise(trigger.activate())
    expect(Reflect.get(trigger, 'current')).toBe(resultA.promise)
    expect(Reflect.get(trigger, 'next')).toBe(resultC.promise)
    expect(resultD.promise).toBe(resultC.promise)

    // When the first callback is done, there is still a fresh debounce
    promises[0].resolve('foo')
    await clock.tickAsync(40)
    expect(Reflect.get(trigger, 'current')).toBe(undefined)
    expect(Reflect.get(trigger, 'next')).toBe(resultC.promise)
    expect(resultA.state).toBe('resolved')
    expect(await resultA.promise).toBe('foo')

    // More debouncing without activation
    void trigger.activate()
    await clock.tickAsync(40)
    void trigger.activate()
    await clock.tickAsync(40)
    const resultE = observePromise(trigger.activate())
    expect(resultE.promise).toBe(resultC.promise)
    expect(callback).toBeCalledTimes(1)

    // Waiting long enough
    await clock.tickAsync(50)
    expect(Reflect.get(trigger, 'current')).toBe(resultC.promise)
    expect(Reflect.get(trigger, 'next')).toBe(undefined)
    expect(callback).toBeCalledTimes(2)

    // When second callback is done, we're back to the start
    promises[1].resolve('bar')
    await clock.tickAsync(0)
    expect(Reflect.get(trigger, 'current')).toBe(undefined)
    expect(Reflect.get(trigger, 'next')).toBe(undefined)
    expect(resultC.state).toBe('resolved')
    expect(await resultC.promise).toBe('bar')
})
