import { TestGroup, TestResult, TestError } from '../test'

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
    error: {
        runId: string
        groupId: string
        testId?: string
        hook?: string
        error: TError
    }
}
