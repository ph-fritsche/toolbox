export { EventEmitter } from './EventEmitter'

export function makeEventTypeCheck<EventMap extends unknown>() {
    return function isEventType<K extends keyof EventMap>(
        event: EventMap[keyof EventMap] & { type: keyof EventMap },
        k: K,
    ): event is EventMap[K] & { type: K } {
        return event.type === k
    }
}
