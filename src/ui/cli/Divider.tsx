import React from 'react'
import { Box, BoxProps } from 'ink'

export function Divider({
    vertical = false,
    style = 'classic',
}: {
    style?: BoxProps['borderStyle']
    vertical?: boolean
}) {
    return <Box
        borderStyle={style}
        borderTop={false}
        borderLeft={false}
        borderBottom={!vertical}
        borderRight={vertical}
    />
}
