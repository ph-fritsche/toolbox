import { TestResult as BaseTestResult } from '../test/TestResult'
import { Test } from './Test'

export class TestResult extends BaseTestResult {
    readonly test: Test

    constructor(
        test: Test,
        props: Omit<ConstructorParameters<typeof BaseTestResult>[0], 'status'> = {},
    ) {
        super({
            status: getStatus(props.error, props.duration),
            ...props,
        })
        this.test = test
    }
}

function getStatus(
    error?: Error,
    duration?: number,
) {
    if (error instanceof TimeoutError) {
        return 'timeout'
    } else if (error) {
        return 'fail'
    } else if (duration) {
        return 'success'
    } else {
        return 'skipped'
    }
}

export class TimeoutError extends Error { }
