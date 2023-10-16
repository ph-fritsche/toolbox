import type { CoverageMapData } from 'istanbul-lib-coverage'
import { TestHookType, TestResultType } from './TestRun'

export interface TestReporter {
    schedule(data: TestScheduleData): void
    error(data: TestErrorData): void
    result(data: TestResultData): void
    complete(data: TestCompleteData): void
}

export type TestNodeData = {
    id: number
    title: string
    children?: TestNodeData[]
}

export type TestScheduleData = {
    nodes: TestNodeData[]
}

export type TestHookData = {
    type: TestHookType
    index: number
    name?: string
    cleanup?: boolean
}

export type TestErrorData = {
    nodeId?: number
    hook?: TestHookData
    error: Error|string
}

export type TestResultData = {
    nodeId: number
    type: TestResultType
    error?: Error|string
    duration?: number
}

export type TestCompleteData = {
    coverage?: CoverageMapData
}
