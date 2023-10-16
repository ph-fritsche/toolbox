import { TestResultType } from './enum'

export class TestResult {
    constructor(
        readonly type: TestResultType,
        readonly error?: Error|string,
        readonly duration?: number,
    ) {}

    getErrorAsString() {
        if (!this.error) {
            return ''
        } else if (typeof this.error === 'string') {
            return this.error
        } else if (this.error.stack) {
            return this.error.stack
        } else {
            return this.error.name + ': ' + this.error.message
        }
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
