import { useEffect, useState } from 'react'

export function useSubscribers(
    subscribers: Array<(rerender: () => void) => (() => void) | undefined>,
    deps: unknown[],
) {
    const [d, setState] = useState({})
    useEffect(() => {
        const s: Array<() => void> = []
        const rerender = debounce(() => setState({}), 5)
        for (const f of subscribers) {
            const u = f(rerender)
            if (u) {
                s.push(u)
            }
        }
        return () => s.forEach(f => f())
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)
    return d
}

function debounce(
    fn: () => void,
    time: number,
) {
    let t: undefined|NodeJS.Timer
    return () => {
        if (!t) {
            t = setTimeout(() => {
                t = undefined
                fn()
            }, time)
        }
    }
}
