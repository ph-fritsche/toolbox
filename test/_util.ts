const after = new Set<() => Promise<void>|void>()

export function afterThis(cb: () => Promise<void>|void) {
    after.add(cb)
}

afterEach(async () => {
    await Promise.allSettled(Array.from(after.values()).map(f => {
        const r = f()
        after.delete(f)
        return r
    }))
})

export function observePromise(promise: Promise<unknown>) {
    let state: 'resolved'|'rejected'|'pending' = 'pending'
    promise.then(
        () => { state = 'resolved'},
        () => { state = 'rejected'},
    )
    return {
        get promise() {
            return promise
        },
        get state() {
            return state
        },
    }
}
