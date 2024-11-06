import React from 'react'
import { TestRunStack } from '../../conductor/TestRun'
import { useTester } from '../TesterContext'
import { useSubscribers } from './useSubscribers'
import { Line } from './Blocks'
import { Text } from 'ink'

export function CurrentRun({
    children,
    fallback = <Line><Text color="grey">No run yet…</Text></Line>,
}: {
    children: (run: TestRunStack) => React.ReactNode
    fallback?: React.ReactNode
}) {
    const tester = useTester()
    useSubscribers([
        r => tester.addListener('newRun', r),
    ], [tester])

    const run = tester.newestRun

    return run ? children(run) : fallback
}
