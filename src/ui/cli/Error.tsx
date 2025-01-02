import React from 'react'
import { StackEntry, XError } from '../../error/XError'
import { useTester } from '../TesterContext'
import { useSubscribers } from './useSubscribers'
import { Text } from 'ink'
import { Scrollable } from './Scrollable'

export function StackEntryText({
    entry,
}: {
    entry: StackEntry,
}) {
    const tester = useTester()
    useSubscribers([
        r => entry.resolved.onResolve(r),
    ], [entry])
    tester.resolveErrorStackEntry(entry)

    return <Text color="redBright" dimColor>at {String(entry)}</Text>
}

export function* renderError(
    error: XError,
    renderLine: (l: React.ReactNode, isLast: boolean) => React.ReactNode,
) {
    const text = error.text.split('\n')
    for(let i = 0; i < text.length; i++) {
        yield renderLine((
            <Text color="redBright">{text[i]}</Text>
        ), !error.stackEntries && i === text.length -1)
    }
    if (error.stackEntries) {
        for(let i = 0; i < error.stackEntries.length; i++) {
            yield renderLine((
                <StackEntryText key={`stackEntry-${i}`} entry={error.stackEntries[i]}/>
            ), i === error.stackEntries.length -1)
        }
    }
}

export function ScrollableError({
    error,
}: {
    error: XError,
}) {
    return <Scrollable key={error.stack ?? error.text}>{Array.from(renderError(error, l => l))}</Scrollable>
}
