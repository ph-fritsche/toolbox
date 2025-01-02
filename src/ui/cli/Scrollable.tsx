import React, { useEffect, useRef, useState } from 'react'
import { Box, measureElement, Text, useInput } from 'ink'

export function Scrollable({
    children,
}: React.PropsWithChildren) {
    const [boxSize, setBoxSize] = useState({ x: 0, y: 0 })
    const [contentSize, setContentSize] = useState({x: 0, y: 0})

    const scrollingX = boxSize.x > 0 && contentSize.x > boxSize.x - 1
    const scrollingY = boxSize.y > 0 && contentSize.y > boxSize.y - Number(scrollingX)

    const width = boxSize.x - Number(scrollingY)
    const height = boxSize.y - Number(scrollingX)

    const maxOffsetY = Math.max(0, contentSize.y - height)
    const maxOffsetX = Math.max(0, contentSize.x - width)

    const [offsetX, setOffsetX] = useState(0)
    const [offsetY, setOffsetY] = useState(0)
    useInput((input, key) => {
        if (key.upArrow) {
            setOffsetY(o => Math.max(0, o - (key.shift ? boxSize.y : 1)))
        } else if (key.downArrow) {
            setOffsetY(o => Math.min(o + (key.shift ? boxSize.y : 1), maxOffsetY))
        } else if (key.leftArrow) {
            setOffsetX(o => Math.max(0, o - (key.shift ? boxSize.x : 1)))
        } else if (key.rightArrow) {
            setOffsetX(o => Math.min(o + (key.shift ? boxSize.x : 1), maxOffsetX))
        }
    })

    const boxEl = useRef(null)
    const contentEl = useRef(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (boxEl.current && contentEl.current) {
            const b = measureElement(boxEl.current)
            const c = measureElement(contentEl.current)
            if (b.width !== boxSize.x || b.height !== boxSize.y || c.width > contentSize.x || c.height > contentSize.y) {
                setBoxSize({x: b.width, y: b.height})
                setContentSize({x: c.width, y: c.height})
                setOffsetY(o => height ? Math.min(o, Math.max(0, c.height - b.height)) : 0)
            }
        }
    })

    const visibleRatioY = contentSize.y ? Math.min(1, height / contentSize.y) : 1
    const scrollbarHeight = Math.max(1, Math.floor(visibleRatioY * height))
    const scrollbarTop = Math.round(offsetY / maxOffsetY * (height - scrollbarHeight))
    const scrollbarY = Array(scrollbarHeight).fill('⣿')
    if (scrollbarHeight > 1) {
        scrollbarY[0] = '⇑'
        scrollbarY[scrollbarY.length - 1] = '⇓'
    } else {
        scrollbarY[0] = '⇕'
    }

    const visibleRatioX = contentSize.x ? Math.min(1, width / contentSize.x) : 1
    const scrollbarWidth = Math.max(1, Math.floor(visibleRatioX * width))
    const scrollbarLeft = Math.round(offsetX / maxOffsetX * (width - scrollbarWidth))
    const scrollbarX = Array(scrollbarWidth).fill('⠶')
    if (scrollbarWidth > 1) {
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
                alignItems="flex-start"
                justifyContent="flex-start"
                overflow="hidden"
            >
                <Box
                    width={OVERFLOWSIZE}
                    height={OVERFLOWSIZE}
                    marginLeft={-offsetX}
                    marginTop={-offsetY}
                    alignItems="flex-start"
                    justifyContent="flex-start"
                >
                    <Box
                        ref={contentEl}
                        flexDirection="column"
                    >
                        {children}
                    </Box>
                </Box>
            </Box>
        </Box>
    </Box>
}

const OVERFLOWSIZE = 1_000_000
