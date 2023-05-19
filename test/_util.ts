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
