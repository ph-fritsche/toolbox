export { EventEmitter, createEventEmitter, getEventDispatch } from './EventEmitter'

import { Event } from './EventEmitter'

export function makeEventTypeCheck<EventMap>() {
    return function isEventType<K extends keyof EventMap>(
        event: Event<EventMap, keyof EventMap>,
        k: K,
    ): event is Event<EventMap, K> {
        return event.type === k
    }
}
