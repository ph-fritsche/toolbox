import { TestHook } from './TestHook'
import { XError } from '../../error/XError'

export class TestError extends XError {
    constructor(
        error: Error|string,
        readonly hook?: TestHook,
    ) {
        if (typeof error === 'string') {
            super('', error)
        } else {
            super(error.name, error.message, error.stack, error.cause)
        }
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
