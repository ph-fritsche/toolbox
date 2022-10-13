import { Serializable } from "./types"

export class TestResult {
    readonly duration?: number
    readonly error?: Error
    readonly status: 'skipped' | 'timeout' | 'fail' | 'success'

    constructor(
        props: Serializable<TestResult>,
    ) {
        for(const k in props) {
            this[k] = props[k]
        }
    }

    toJSON(): Serializable<TestResult> {
        return {
            status: this.status,
            duration: this.duration,
            error: this.error && {
                ...this.error,
                name: this.error.name,
                message: this.error.message,
                stack: this.error.stack,
                cause: this.error.cause,
            },
        }
    }
}
