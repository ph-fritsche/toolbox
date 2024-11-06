import React from 'react'
import { isTestRun, TestResultType, TestRunInstance, TestRunState, TestSuite } from '../../conductor/TestRun'
import { TestFunction, TestFunctionStack } from '../../conductor/TestRun/TestFunction'
import { Text, TextProps } from 'ink'
import { useSubscribers } from './useSubscribers'
import { TestInstanceIndex } from '../../conductor/TestRun/TestIndex'

export function InstanceStatusIcon({
    node,
}: {
    node: TestSuite|TestRunInstance
}) {
    useSubscribers([
        r => node.addListener('skip', r),
        r => node.addListener('start', r),
        r => node.addListener('error', r),
        r => node.addListener('result', r),
        r => node.addListener('done', r),
    ], [node])

    const [icon, props] = isTestRun(node) ? getRunStatus(node) : getSuiteStatus(node)
    return <Text {...props}>{icon}</Text>
}

function getRunStatus(
    run: TestRunInstance,
): [string, TextProps] {
    if (run.index.suites.pending.size) {
        return ['⋅', {}]
    } else if (run.index.suites.running.size) {
        return getRunningStatus(run.index)
    } else if (run.index.suites.done.size) {
        return getDoneStatus(run.index)
    }
    return ['-', {}]
}

function getSuiteStatus(
    suite: TestSuite,
): [string, TextProps] {
    switch(suite.state) {
    case TestRunState.pending:
        return ['⋅', {}]
    case TestRunState.skipped:
        return ['-', {}]
    case TestRunState.running:
        return getRunningStatus(suite.index)
    default:
        return getDoneStatus(suite.index)
    }
}

function getRunningStatus(
    index: TestInstanceIndex,
): [string, TextProps] {
    if (index.errors.size) {
        return ['!', { color: 'red' }]
    } else if (index.results.fail.size) {
        return ['x', { color: 'red' }]
    } else if (index.results.timeout.size) {
        return ['t', { color: 'yellowBright' }]
    }
    return ['⋄', {}]
}

function getDoneStatus(
    index: TestInstanceIndex,
): [string, TextProps] {
    if (index.errors.size) {
        return ['!', { color: 'red' }]
    } else if (index.results.fail.size) {
        return ['x', { color: 'red' }]
    } else if (index.results.timeout.size) {
        return ['t', { color: 'yellowBright' }]
    } else if (index.results.success.size) {
        return ['✓', { color: index.results.skipped.size ? undefined : 'green' }]
    } else if (index.results.skipped.size) {
        return ['-', { color: 'green' }]
    }
    return ['∅', {}]
}

export function FunctionStatusIcon({
    node,
    ...textProps
}: {
    node: TestFunctionStack|TestFunction
} & TextProps) {
    useSubscribers([
        r => node.addListener('result', r),
    ], [node])

    const [icon, props] = getFunctionStatusIcon(node)
    return <Text {...props} {...textProps}>{icon}</Text>
}

export function getFunctionStatusIcon(
    node: TestFunctionStack|TestFunction,
): [string, TextProps] {
    return getResultIcon('resultType' in node ? node.resultType : node.result.get()?.type)
}

export function ResultIcon({
    resultType,
}: {
    resultType: TestResultType | 'MIXED' | undefined
}) {
    const [icon, props] = getResultIcon(resultType)
    return <Text {...props}>{icon}</Text>
}

export function getResultIcon(
    resultType: TestResultType|'MIXED'|undefined,
): [string, TextProps] {
    switch (resultType) {
    case 'MIXED':
        return ['M', { color: 'red' }]
    case TestResultType.fail:
        return ['x', { color: 'red' }]
    case TestResultType.timeout:
        return ['t', { color: 'yellowBright' }]
    case TestResultType.skipped:
        return ['-', {}]
    case TestResultType.success:
        return ['✓', { color: 'green' }]
    default:
        return [' ', {}]
    }
}
