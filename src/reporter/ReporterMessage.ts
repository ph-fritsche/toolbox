import { TestGroup, TestResult, TestError } from '../test'
import type { CoverageMapData } from 'istanbul-lib-coverage'

export type ReporterMessageMap<
    TGroup extends TestGroup = TestGroup,
    TResult extends TestResult = TestResult,
    TError extends TestError = TestError,
> = {
    schedule: {
        runId: string
        group: TGroup
    }
    result: {
        runId: string
        testId: string
        result: TResult
    }
    complete: {
        runId: string
        groupId: string
        coverage: CoverageMapData
    }
    error: {
        runId: string
        groupId: string
        testId?: string
        hook?: string
        error: TError
    }
}
