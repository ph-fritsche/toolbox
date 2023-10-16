import { TestHook } from './TestHook'

export class TestError {
    constructor(
        readonly error: Error|string,
        readonly hook?: TestHook,
    ) {}

    toString() {
        return typeof this.error === 'string'
            ? this.error
            : this.error.stack ?? `${this.error.name}: ${this.error.message}`
    }
}

export class TestErrorList implements Iterable<TestError> {
    constructor(
        onAdd: (error: TestError) => void,
    ) {
        this.#onAdd = onAdd
    }

    #onAdd: (error: TestError) => void
    #errors = new Map<string, TestError[]>()

    add(error: TestError) {
        const ident = JSON.stringify(error.hook)
        if(!this.#errors.has(ident)) {
            this.#errors.set(ident, [])
        }
        this.#errors.get(ident)?.push(error)
        this.#onAdd(error)
    }

    get count() {
        return this.#errors.size
    }

    *[Symbol.iterator]() {
        for (const e of this.#errors.values()) {
            yield* e.values()
        }
    }

    *grouped() {
        for (const e of this.#errors.values()) {
            yield e.values()
        }
    }
}
