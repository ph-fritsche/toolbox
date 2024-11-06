import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { useTester } from '../TesterContext'
import { useRouter } from './Router'
import { useSubscribers } from './useSubscribers'
import { Block, Element } from './Blocks'
import { Key } from './Key'

export function ConductorsSelect() {
    const tester = useTester()

    const [conductors, setConductors] = useState(tester.conductors.get())
    const [index, setIndex] = useState(0)

    useSubscribers([
        () => tester.addListener('option', e => {
            if (e.key === 'conductors') {
                setConductors(e.value)
            }
        }),
    ], [tester])

    const { navigate } = useRouter()
    useInput((input, key) => {
        if (key.escape) {
            if (conductors === tester.conductors.get()) {
                navigate('/')
            } else {
                setConductors(tester.conductors.get())
            }
        } else if (key.return) {
            if (conductors !== tester.conductors.get()) {
                tester.conductors.set(conductors)
            }
            navigate('/')
        } else if (input === ' ') {
            for (let i = 0, generator = conductors.entries(), entry;
                // eslint-disable-next-line no-cond-assign
                entry = generator.next().value;
                i++
            ) {
                if (i === index) {
                    const v = new Map(conductors)
                    v.set(entry[0], !entry[1])
                    setConductors(v)
                    break
                }
            }
        } else if (key.upArrow) {
            setIndex(i => i > 0 ? i - 1 : conductors.size - 1)
        } else if (key.downArrow) {
            setIndex(i => i < conductors.size - 1 ? i + 1 : 0)
        } else if (input.toLowerCase() === 'a') {
            const v = new Map()
            let b = true
            for (const a of conductors.values()) {
                if (a) {
                    b = false
                }
            }
            for (const c of conductors.keys()) {
                v.set(c, b)
            }
            setConductors(v)
        }
    })

    const elements = []
    let activeCount = 0
    for(let i = 0, generator = conductors.entries(), entry;
        // eslint-disable-next-line no-cond-assign
        entry = generator.next().value;
        i++
    ) {
        const [conductor, active] = entry
        elements.push((
            <Box key={i}
                width={conductor.title.length + 5}
            >
                <Text backgroundColor={i === index ? 'magentaBright' : undefined}>
                    <Text color="grey">(</Text>
                    <Text>{active ? '✓' : ' '}</Text>
                    <Text color="grey">)</Text>
                    <Text>{' '}</Text>
                    <Text>{conductor.title}</Text>
                    <Text>{' '}</Text>
                </Text>
            </Box>
        ))
        if (active) {
            activeCount++
        }
    }

    return <Element
        justifyContent="space-between"
        columnGap={5}
        rowGap={2}
        flexWrap="wrap"
    >
        <Block>
            <Text>{activeCount}/{elements.length} Conductors</Text>
            <Block marginTop={1}>{elements}</Block>
        </Block>
        <Block
            overflow="visible"
            justifyContent="flex-end"
        >
            <Text><Key>Space</Key> De/select</Text>
            <Text><Key>A</Key> De/select all</Text>
            <Text><Key>↓</Key><Key>↑</Key> Move cursor</Text>
            <Text><Key>Esc</Key> Reset/Go back</Text>
            <Text><Key>Enter</Key>Confirm</Text>
        </Block>
    </Element>
}
