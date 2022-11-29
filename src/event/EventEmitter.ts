type EventHandler<EventMap, K extends keyof EventMap> = (event: EventMap[K] & {type: K}) => void

export class EventEmitter<EventMap extends {}> {
    private listeners: {
        [K in keyof EventMap]?: Set<EventHandler<EventMap, K>>
    } = {}

    dispatch<K extends keyof EventMap>(type: K, init: EventMap[K]) {
        const event = { type, ...init }
        this.listeners[type]?.forEach(l => l(event))
    }

    addListener<K extends keyof EventMap>(type: K, handler: EventHandler<EventMap, K>) {
        this.listeners[type] ??= new Set<EventHandler<EventMap, K>>()
        this.listeners[type]?.add(handler)

        return () => this.removeListener(type, handler)
    }

    removeListener<K extends keyof EventMap>(type: K, handler: EventHandler<EventMap, K>) {
        this.listeners[type]?.delete(handler)
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

export type EventMapOf<Emitter extends EventEmitter<{}>> = Emitter extends EventEmitter<infer M> ? M : never

export type Event<EventMap, K extends keyof EventMap> = {
    type: K
} & EventMap[K]