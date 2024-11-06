import React, { useEffect, useRef, useState } from 'react'
import { Box, measureElement, Text, TextProps, useInput } from 'ink'
import widestLine from 'widest-line'

export function Scrollable({
    content,
    ...textProps
}: {
    /** Only elements with size.y 1 are supported */
    content: Array<React.ReactNode>|string
} & TextProps) {
    const lines = typeof content === 'string' ? content.split('\n') : content
    const contentHeight = lines.length
    const contentWidth = typeof content === 'string' ? widestLine(content) : 0

    const [size, setSize] = useState({ x: 0, y: 0 })

    const scrollingX = size.x > 0 && contentWidth > size.x - 1
    const scrollingY = size.y > 0 && contentHeight > size.y - Number(scrollingX)

    const width = size.x - Number(scrollingY)
    const height = size.y - Number(scrollingX)

    const maxOffsetY = Math.max(0, contentHeight - height)
    const maxOffsetX = Math.max(0, contentWidth - width)

    const [offsetX, setOffsetX] = useState(0)
    const [offsetY, setOffsetY] = useState(0)
    useInput((input, key) => {
        if (key.upArrow) {
            setOffsetY(o => Math.max(0, o - (key.shift ? size.y : 1)))
        } else if (key.downArrow) {
            setOffsetY(o => Math.min(o + (key.shift ? size.y : 1), maxOffsetY))
        } else if (key.leftArrow) {
            setOffsetX(o => Math.max(0, o - (key.shift ? size.x : 1)))
        } else if (key.rightArrow) {
            setOffsetX(o => Math.min(o + (key.shift ? size.x : 1), maxOffsetX))
        }
    })

    const boxEl = useRef(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (boxEl.current) {
            const {width, height} = measureElement(boxEl.current)
            if (width !== size.x || height !== size.y) {
                setSize({x: width, y: height})
                setOffsetY(o => height ? Math.min(o, Math.max(0, contentHeight - height)) : 0)
            }
        }
    })

    const visibleRatioY = contentHeight ? Math.min(1, height / contentHeight) : 1
    const scrollbarHeight = Math.max(1, Math.floor(visibleRatioY * height))
    const scrollbarTop = Math.round(offsetY / maxOffsetY * (height - scrollbarHeight))
    const scrollbarY = Array(scrollbarHeight).fill('⣿')
    if (scrollbarHeight > 1) {
        scrollbarY[0] = '⇑'
        scrollbarY[scrollbarY.length - 1] = '⇓'
    } else {
        scrollbarY[0] = '⇕'
    }

    const visibleRatioX = contentWidth ? Math.min(1, width / contentWidth) : 1
    const scrollbarWidth = Math.max(1, Math.floor(visibleRatioX * width))
    const scrollbarLeft = Math.round(offsetX / maxOffsetX * (width - scrollbarWidth))
    const scrollbarX = Array(scrollbarWidth).fill('⠶')
    if (scrollbarHeight > 1) {
        scrollbarX[0] = '⇐'
        scrollbarX[scrollbarX.length - 1] = '⇒'
    } else {
        scrollbarX[0] = '⇔'
    }

    return <Box
        flexShrink={1}
        flexGrow={1}
        flexDirection="row-reverse"
        justifyContent="flex-end"
        ref={boxEl}
    >
        {scrollingY && (
            <Box
                flexGrow={0}
                flexShrink={0}
                width={1}
                height={scrollbarHeight}
                marginTop={scrollbarTop}
                flexDirection="column"
            >
                <Text>{scrollbarY[0]}</Text>
                <Text color="grey">{scrollbarY.slice(1, -1)}</Text>
                <Text>{scrollbarY.length > 1 && scrollbarY.at(-1)}</Text>
            </Box>
        )}
        <Box
            flexGrow={1}
            flexShrink={1}
            flexDirection="column-reverse"
            justifyContent="flex-end"
        >
            {scrollingX && (
                <Box
                    flexGrow={0}
                    flexShrink={0}
                    height={1}
                    width={scrollbarWidth}
                    marginLeft={scrollbarLeft}
                    flexWrap="nowrap"
                >
                    <Text>{scrollbarX[0]}</Text>
                    <Text color="grey">{scrollbarX.slice(1, -1)}</Text>
                    <Text>{scrollbarX.length > 1 && scrollbarX.at(-1)}</Text>
                </Box>
            )}
            <Box
                flexShrink={1}
                flexGrow={1}
                flexDirection="column"
                justifyContent="flex-start"
            >
                {(scrollingY
                    ? lines.slice(offsetY, offsetY + height)
                    : lines
                ).map((l, i) => (typeof l === 'string'
                    ? <Text key={i} wrap="truncate-end" {...textProps}>
                        {l.substring(offsetX, offsetX + width) || ' '}
                    </Text>
                    : l
                ))}
            </Box>
        </Box>
    </Box>
}
