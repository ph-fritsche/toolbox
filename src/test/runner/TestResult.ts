import type { Test } from './Test'

export class TestResult {
    constructor(
        readonly test: Test,
        readonly duration?: number,
        readonly error?: Error,
    ) {
    }
        
    get status() {
        if (this.error instanceof TimeoutError) {
            return 'timeout'
        } else if (this.error) {
            return 'fail'
        } else if (this.duration) {
            return 'success'
        } else {
            return 'skipped'
        }
    }
}

export class TimeoutError extends Error { }