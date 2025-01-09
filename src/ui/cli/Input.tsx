import React, { useMemo } from 'react'
import { Box, Text, TextProps, useInput } from 'ink'
import { useState } from 'react'

export function useStringInput(
    initialValue: string,
    {
        onChange,
        onInput,
        onReset,
        onEscape,
        isFocused = true,
    }: {
        onChange: (s: string) => void|boolean
        onInput?: (s: string) => void
        onReset?: (s: string) => void
        onEscape?: () => void
        isFocused?: boolean
    },
) {
    const [{ value, pos }, set] = useState({ value: initialValue, pos: initialValue.length })
    useMemo(() => {
        if (value !== initialValue) {
            set({ value: initialValue, pos: initialValue.length })
            onReset?.(initialValue)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialValue])

    useInput((input, key) => {
        if (!isFocused) {
            return
        }

        if (key.escape) {
            if (value !== initialValue) {
                set({ value: initialValue, pos: initialValue.length })
                onReset?.(initialValue)
            } else {
                onEscape?.()
            }
        } else if (key.return) {
            if (value !== initialValue) {
                if (onChange(value) !== false) {
                    onEscape?.()
                }
            } else {
                onEscape?.()
            }
        } else if (key.shift && (key.backspace || key.delete)) {
            set({ value: '', pos: 0 })
            onInput?.('')
        } else if (key.backspace || key.delete) {
            set(({ value, pos }) => {
                const v = value.substring(0, pos - 1) + value.substring(pos)
                onInput?.(v)
                return {
                    value: v,
                    pos: Math.max(0, pos - 1),
                }
            })
        } else if (input && !key.ctrl && !key.meta) {
            set(({ value, pos }) => {
                const v = value.substring(0, pos) + input + value.substring(pos)
                onInput?.(v)
                return {
                    value: v,
                    pos: pos + input.length,
                }
            })
        } else if (key.leftArrow) {
            set(({ value, pos }) => ({ value, pos: Math.max(0, pos - 1) }))
        } else if (key.rightArrow) {
            set(({ value, pos }) => ({ value, pos: Math.min(value.length, pos + 1) }))
        } else if (key.pageUp) {
            set(({ value }) => ({ value, pos: 0 }))
        } else if (key.pageDown) {
            set(({ value }) => ({ value, pos: value.length }))
        }
    })

    return {value, pos, isFocused}
}

export function InputField({
    title,
    value,
    pos,
    width = 20,
    isFocused = true,
}: {
    title: string
    value: string
    pos: number
    width?: number
    isFocused?: boolean
}) {
    const innerWidth = width - 4

    return <Box
        flexDirection="column"
        flexWrap="nowrap"
        overflow="hidden"
        width={width}
        flexShrink={0}
        flexGrow={0}
    >
        <Box flexWrap="nowrap" justifyContent="flex-start">
            <Text color="grey" dimColor>╭╴</Text>
            <Text
                bold={isFocused}
            >{title}</Text>
            <Text color="grey" dimColor>╶{''.padEnd(innerWidth - title.length, '─')}╮</Text>
        </Box>
        <Box flexWrap="nowrap" justifyContent="flex-start">
            <Text color="grey" dimColor>╰{value || isFocused ? '╸' : '─'}</Text>
            {isFocused
                ? <FocusedInputValue value={value} pos={pos} width={innerWidth}/>
                : <Text>{value.substring(0, innerWidth)}</Text>
            }
            <Text color="grey" dimColor>{
                (value || isFocused ? '╺' : '─')
                + (isFocused ? '' : ''.padEnd(innerWidth - value.length, '─'))
            }╯</Text>
        </Box>
    </Box>
}

function FocusedInputValue({
    value,
    pos,
    width,
}: {
    value: string
    pos: number
    width: number
}) {
    const head = value.substring(pos - Math.min(pos, Math.max(3, width - 1 - (value.length - pos))), pos)
    const cursor = value.substring(pos, pos + 1) || ' '
    const tail = value.substring(pos + 1).substring(0, width - head.length)

    return <Box
        flexWrap="nowrap"
        overflow="hidden"
        justifyContent="flex-start"
        width={width}
        height={1}
    >
        <Text
            backgroundColor="yellowBright"
            color="blue"
        >{head}</Text>
        <Text
            backgroundColor="blueBright"
            color="yellowBright"
        >{cursor}</Text>
        <Text
            backgroundColor="yellowBright"
            color="blue"
        >{tail}</Text>
        <Text
            backgroundColor="yellow"
        >{''.padEnd(width - head.length - cursor.length - tail.length, ' ')}</Text>
    </Box>
}

export function Value({
    width = 10,
    children,
    ...others
}: {
    width?: number
    backgroundColor?: TextProps['backgroundColor']
    color?: TextProps['color']
    children: string
}) {
    return <Box
        width={Math.max(width, children.length + 2)}
        height={1}
        flexGrow={0}
        flexShrink={0}
        overflow="hidden"
        flexWrap="nowrap"
    >
        <Text
            backgroundColor="grey"
            wrap="end"
        >
            {' '}
            <Text
                color="black"
                backgroundColor="white"
                {...others}
            >{children}</Text>
            {' '.padEnd(width - children.length - 1)}
        </Text>
    </Box>
}
