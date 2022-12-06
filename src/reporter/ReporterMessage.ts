import { TestGroup, TestResult, TestError } from '../test'
import type { CoverageMapData } from 'istanbul-lib-coverage'

export type ReporterMessageMap<
    TGroup extends TestGroup,
    TResult extends TestResult,
    TError extends TestError,
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
