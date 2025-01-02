import { TestResultType } from './enum'
import { XError } from '../../error/XError'

export class TestResult {
    constructor(
        readonly type: TestResultType,
        error?: Error|string,
        readonly duration?: number,
    ) {
        this.error = TestResultError.from(error)
    }
    readonly error
}

export class TestResultError extends XError {
    static from(e?: Error|string) {
        if (e === undefined) {
            return undefined
        } else if (typeof e === 'string') {
            return new TestResultError('', e)
        }
        return new TestResultError(e.name, e.message, e.stack, e.cause)
    }
}

export class TestResultState {
    constructor(
        onSet: (result: TestResult) => void,
    ) {
        this.#onSet = onSet
    }

    #onSet: (result: TestResult) => void
    #result?: TestResult

    get() {
        return this.#result
    }

    set(result: TestResult) {
        this.#result = result
        this.#onSet(result)
    }
}
