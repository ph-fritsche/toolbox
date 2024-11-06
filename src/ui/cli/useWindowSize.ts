import { useEffect, useState } from 'react'

export function useWindowSize() {
    const [size, setSize] = useState(process.stdout.getWindowSize())

    useEffect(() => {
        const h = () => setSize(process.stdout.getWindowSize())
        process.stdout.addListener('resize', h)
        return () => void process.stdout.removeListener('resize', h)
    }, [])

    return {width: size[0], height: size[1]}
}
