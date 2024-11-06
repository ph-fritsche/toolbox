import React from 'react'
import { Text, TextProps } from 'ink'
import { TestNodeInstance } from '../../conductor/TestRun'

export function NodeConductor({
    node,
    ...props
}: {
    node: TestNodeInstance
} & Omit<TextProps, 'children'>) {
    return <Text {...props}>
        <Text dimColor>❲</Text>
        <Text>{node.run.conductor.title}</Text>
        <Text dimColor>❳</Text>
    </Text>
}
