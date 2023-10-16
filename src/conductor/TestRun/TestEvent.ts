import { TestError, TestResult, TestSuite } from '.'
import { TestFunction } from './TestFunction'
import { TestGroup } from './TestGroup'

export type TestEventMap = {
    skip: {
        node: TestSuite
    }
    start: {
        node: TestSuite
    }
    done: {
        node: TestSuite
    }
    schedule: {
        node: TestSuite
    }
    complete: {
        node: TestSuite
    }
    error: {
        node: TestSuite|TestGroup
        error: TestError
    }
    result: {
        node: TestFunction
        result: TestResult
    }
}
