import { Entity } from './Entity'
import { Test } from './Test'
import { TestError } from './TestError'
import { TestGroup } from './TestGroup'
import { TestResult } from './TestResult'

export class TestRun extends Entity {
    suites = new Map<string, TestGroup>()
    groups = new Map<string, TestGroup>()
    tests = new Map<string, Test>()
    results = new Map<string, TestResult>
    errors = new Map<string, Array<{
        hook?: string,
        testId?: string,
        error: TestError
    }>>
}
