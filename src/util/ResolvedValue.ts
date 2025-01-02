export class ResolvedValue<T> {
    constructor(value: T) {
        this.#value = value
    }

    #value: T
    #resolved?: {value: T} | {promise: Promise<T>}
    #listeners = new Set<(resolved: T) => void>()

    get() {
        return this.#resolved && 'value' in this.#resolved
            ? this.#resolved.value
            : this.#value
    }

    get isResolved() {
        return this.#resolved && 'value' in this.#resolved
    }

    resolve(
        resolver: (unresolved: T) => Promise<T>,
    ) {
        if (this.#resolved) {
            return
        }

        const promise = resolver(this.#value)
        this.#resolved = { promise }

        void promise.then(value => {
            this.#resolved = {value}
            this.#listeners.forEach(f => f(value))
            this.#listeners.clear()
        })
    }

    onResolve(
        listener: (resolved: T) => void,
    ) {
        if (this.#resolved && 'value' in this.#resolved) {
            return
        }
        this.#listeners.add(listener)
        return () => this.#listeners.delete(listener)
    }
}
