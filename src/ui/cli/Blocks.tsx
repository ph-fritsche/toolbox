import React from 'react'
import { Box, BoxProps } from 'ink'

export function Block(props: React.PropsWithChildren<BoxProps>) {
    return <Box
        flexShrink={0}
        flexGrow={0}
        flexDirection="column"
        justifyContent="flex-start"
        flexWrap="nowrap"
        {...props}
    />
}

export function Element(props: React.PropsWithChildren<BoxProps>) {
    return <Box
        justifyContent="flex-start"
        alignItems="flex-start"
        flexShrink={0}
        flexGrow={0}
        flexWrap="wrap"
        {...props}
    />
}

export function Line(props: React.PropsWithChildren<BoxProps>) {
    return <Box
        justifyContent="flex-start"
        alignItems="flex-start"
        flexShrink={0}
        flexGrow={0}
        height={1}
        flexWrap="nowrap"
        overflow="hidden"
        {...props}
    />
}

export function OverflowX({
    children,
    ...props
}: React.PropsWithChildren<BoxProps>) {
    return (
        <Block
            width={0}
            overflow="visible"
            {...props}
        >
            <Block flexShrink={0}
                // Prevent truncated lines
                width={10000}
            >{children}</Block>
        </Block>
    )
}
