const dispatch = Symbol('Dispatch event')

type EventMap = {[k in string]: object|null|undefined}

export function createEventEmitter<Events extends EventMap>(
    parent?: EventEmitter<Events>,
) {
    const emitter = new EventEmitter<Events>(parent)
    const dispatch = getEventDispatch(emitter)

    return [emitter, dispatch] as const

}

export function getEventDispatch<Events extends EventMap>(
    emitter: EventEmitter<Events>,
) {
    return emitter[dispatch].bind(emitter)
}

export class EventEmitter<Events extends EventMap> {
    constructor(
        parent?: EventEmitter<Events>,
    ) {
        this.#parent = parent
    }

    [dispatch]<K extends keyof Events>(type: K, init: Events[K]) {
        const event = { type, ...init }
        setImmediate(() => {
            for (const l of this.#iterateListeners(type)) {
                l(event)
            }
        })
    }

    *#iterateListeners<K extends keyof Events>(type: K): Generator<EventHandler<Events, K>, void, void> {
        if (this.#listeners[type]) {
            yield* this.#listeners[type]
        }
        if (this.#parent) {
            yield* this.#parent.#iterateListeners(type)
        }
    }
    #parent?: EventEmitter<Events>
    #listeners: {
        [K in keyof Events]?: Set<EventHandler<Events, K>>
    } = {}

    addListener<K extends keyof Events>(type: K, handler: EventHandler<Events, K>) {
        this.#listeners[type] ??= new Set<EventHandler<Events, K>>()
        this.#listeners[type]?.add(handler)

        return () => this.removeListener(type, handler)
    }

    removeListener<K extends keyof Events>(type: K, handler: EventHandler<Events, K>) {
        this.#listeners[type]?.delete(handler)
    }

    once<K extends keyof Events>(type: K, handler: EventHandler<Events, K>) {
        const h: EventHandler<Events, K> = e => {
            this.removeListener(type, h)
            handler(e)
        }
        this.addListener(type, h)

        return () => this.removeListener(type, h)
    }
}

export type EventMapOf<Emitter> = Emitter extends EventEmitter<infer M> ? M : never

export type Event<EventMap, K extends keyof EventMap> = {
    type: K
} & (EventMap[K] extends object ? EventMap[K] : unknown)

export type EventHandler<EventMap, K extends keyof EventMap> = (event: Event<EventMap, K>) => void
