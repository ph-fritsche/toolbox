import React from 'react'
import { Text, TextProps } from 'ink'

export function Key({
    color = 'cyanBright',
    bracketColor = 'cyan',
    backgroundColor,
    children,
}: {
    backgroundColor?: TextProps['backgroundColor']
    color?: TextProps['color']
    bracketColor?: TextProps['color']
    children: string|string[]
}) {
    return <Text
        backgroundColor={backgroundColor}
        wrap="truncate"
    >
        <Text color={bracketColor} dimColor>[</Text>
        {(Array.isArray(children) ? children : [children]).map((k, i) => (
            (<React.Fragment key={`${i}-${k}`}>
                {i > 0 && (<Text color={bracketColor} dimColor>+</Text>)}
                <Text color={color}>{k}</Text>
            </React.Fragment>)
        ))}
        <Text color={bracketColor} dimColor>]</Text>
    </Text>
}
