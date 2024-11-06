import React from 'react'
import { useTester } from '../TesterContext'
import { Scrollable } from './Scrollable'
import { Text } from 'ink'

export function WatchedFiles() {
    const tester = useTester()

    // TODO: update when files are added/deleted

    return <Scrollable content={Array.from(tester.watcher.files()).map(f => (
        <Text key={f} wrap="truncate-end">{f}</Text>
    ))}/>
}
