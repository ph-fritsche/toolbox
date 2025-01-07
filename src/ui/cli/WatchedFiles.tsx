import React from 'react'
import { useTester } from '../TesterContext'
import { Scrollable } from './Scrollable'
import { Text } from 'ink'
import { Line } from './Blocks'

export function WatchedFiles() {
    const tester = useTester()

    // TODO: update when files are added/deleted

    return <Scrollable>
        {Array.from(tester.watcher.files()).sort().map(f => (
            <Line key={f}>
                <Text wrap="truncate-end">{f}</Text>
            </Line>
        ))}
    </Scrollable>
}
