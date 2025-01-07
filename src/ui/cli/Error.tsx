import React from 'react'
import { StackEntry, XError } from '../../error/XError'
import { useTester } from '../TesterContext'
import { useSubscribers } from './useSubscribers'
import { Text } from 'ink'
import { Block, Line } from './Blocks'

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

export function XErrorComponent({
    error,
    border = false,
}: {
    error: XError,
    border?: boolean,
}) {
    return <Block>
        {error.text.split('\n').map((t, i, a) => (
            <Line key={`${i}-${t}`}>
                {border && (<Text color="grey" dimColor>{
                    (!error.stackEntries && i === a.length - 1) ? '╰ ' : '╎ '
                }</Text>)}
                <Text color="redBright">{t}</Text>
            </Line>
        ))}
        {error.stackEntries?.map((entry, i, a) => (
            <Line key={`stack-${i}`}>
                {border && (<Text color="grey" dimColor>{
                    (i === a.length - 1) ? '╰ ' : '╎ '
                }</Text>)}
                <StackEntryText entry={entry}/>
            </Line>
        ))}
    </Block>
}
