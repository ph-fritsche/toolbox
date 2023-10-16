const dispatch = Symbol('Dispatch event')

export function createEventEmitter<EventMap>(
    parent?: EventEmitter<EventMap>,
) {
    const emitter = new EventEmitter<EventMap>(parent)
    const dispatch = getEventDispatch(emitter)

    return [emitter, dispatch] as const

}

export function getEventDispatch<EventMap>(
    emitter: EventEmitter<EventMap>,
) {
    return emitter[dispatch].bind(emitter)
}

export class EventEmitter<EventMap> {
    constructor(
        parent?: EventEmitter<EventMap>,
    ) {
        this.#parent = parent
    }

    [dispatch]<K extends keyof EventMap>(type: K, init: EventMap[K]) {
        const event = { type, ...init }
        this.#listeners[type]?.forEach(l => l(event))

        if (this.#parent) {
            this.#parent[dispatch](type, init)
        }
    }

    #parent?: EventEmitter<EventMap>
    #listeners: {
        [K in keyof EventMap]?: Set<EventHandler<EventMap, K>>
    } = {}

    addListener<K extends keyof EventMap>(type: K, handler: EventHandler<EventMap, K>) {
        this.#listeners[type] ??= new Set<EventHandler<EventMap, K>>()
        this.#listeners[type]?.add(handler)

        return () => this.removeListener(type, handler)
    }

    removeListener<K extends keyof EventMap>(type: K, handler: EventHandler<EventMap, K>) {
        this.#listeners[type]?.delete(handler)
    }

    once<K extends keyof EventMap>(type: K, handler: EventHandler<EventMap, K>) {
        const h: EventHandler<EventMap, K> = e => {
            this.removeListener(type, h)
            handler(e)
        }
        this.addListener(type, h)

        return () => this.removeListener(type, h)
    }
}

export type EventMapOf<Emitter extends EventEmitter<unknown>> = Emitter extends EventEmitter<infer M> ? M : never

export type Event<EventMap, K extends keyof EventMap> = {
    type: K
} & EventMap[K]

export type EventHandler<EventMap, K extends keyof EventMap> = (event: Event<EventMap, K>) => void
