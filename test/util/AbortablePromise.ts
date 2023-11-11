import { AbortablePromise } from '#src/util/AbortablePromise'

test('resolve promise', async () => {
    const log: string[] = []
    const teardownA = mock.fn(() => new Promise<void>(r => setTimeout(r)).then(() => void log.push('teardownA')))
    const teardownB = mock.fn(() => void log.push('teardownB'))
    const settled = mock.fn(() => void log.push('settled'))
    const promise = new AbortablePromise<string>(new AbortController(), (resolve, reject, onTeardown) => {
        resolve('foo')
        onTeardown(teardownA)
        onTeardown(teardownB)
    })
    await promise.then(settled)

    expect(teardownA).toBeCalledWith()
    expect(teardownB).toBeCalledWith()
    expect(settled).toBeCalledWith('foo')
    expect(log).toEqual(['teardownB', 'teardownA', 'settled'])
})

test('reject promise', async () => {
    const log: string[] = []
    const teardownA = mock.fn(() => new Promise(r => setTimeout(r)).then(() => void log.push('teardownA')))
    const teardownB = mock.fn(() => void log.push('teardownB'))
    const settled = mock.fn(() => void log.push('settled'))
    const promise = new AbortablePromise<string>(new AbortController(), (resolve, reject, onTeardown) => {
        reject('foo')
        onTeardown(teardownA)
        onTeardown(teardownB)
    })
    await promise.catch(settled)

    expect(teardownA).toBeCalledWith('foo')
    expect(teardownB).toBeCalledWith('foo')
    expect(settled).toBeCalledWith('foo')
    expect(log).toEqual(['teardownB', 'teardownA', 'settled'])
})

test('throw in teardown on resolved', async () => {
    const log: string[] = []
    const teardownA = mock.fn(() => new Promise(r => setTimeout(r)).then(() => void log.push('teardownA'))
        .then(() => {throw 'bar'}))
    const teardownB = mock.fn(() => void log.push('teardownB'))
    const settled = mock.fn(() => void log.push('settled'))
    const promise = new AbortablePromise<string>(new AbortController(), (resolve, reject, onTeardown) => {
        resolve('foo')
        onTeardown(teardownA)
        onTeardown(teardownB)
    })
    await promise.catch(settled)

    expect(teardownA).toBeCalledWith()
    expect(teardownB).toBeCalledWith()
    expect(settled).toBeCalledWith('bar')
    expect(log).toEqual(['teardownB', 'teardownA', 'settled'])
})

test('throw in teardown rejected', async () => {
    const log: string[] = []
    const teardownA = mock.fn(() => new Promise(r => setTimeout(r)).then(() => void log.push('teardownA'))
        .then(() => {throw 'bar'}))
    const teardownB = mock.fn(() => void log.push('teardownB'))
    const settled = mock.fn(() => void log.push('settled'))
    const promise = new AbortablePromise<string>(new AbortController(), (resolve, reject, onTeardown) => {
        reject('foo')
        onTeardown(teardownA)
        onTeardown(teardownB)
    })
    await promise.catch(settled)

    expect(teardownA).toBeCalledWith('foo')
    expect(teardownB).toBeCalledWith('foo')
    expect(settled).toBeCalledWith('foo')
    expect(log).toEqual(['teardownB', 'teardownA', 'settled'])
})

test('abort promise', async () => {
    const log: string[] = []
    const teardownA = mock.fn(() => new Promise(r => setTimeout(r)).then(() => void log.push('teardownA')))
    const teardownB = mock.fn(() => void log.push('teardownB'))
    const settled = mock.fn(() => void log.push('settled'))
    const promise = new AbortablePromise<string>(new AbortController(), (resolve, reject, onTeardown) => {
        onTeardown(teardownA)
        onTeardown(teardownB)
    })
    const p = promise.catch(settled)
    promise.abort()
    await p

    expect(promise.signal.aborted).toBe(true)
    expect(teardownA).toBeCalledWith(promise.signal)
    expect(teardownB).toBeCalledWith(promise.signal)
    expect(settled).toBeCalledWith(promise.signal)
    expect(log).toEqual(['teardownB', 'teardownA', 'settled'])
})
