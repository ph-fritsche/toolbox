export class Entity {
    readonly id: string
    constructor(
        props: Partial<Entity> = {}
    ) {
        this.id = props.id ?? makeId(6)
    }
}

const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
function makeId(length: number) {
    let c = ''
    while (c.length < length) {
        c += chars[Math.round(Math.random() * chars.length - 0.5)]
    }
    return c
}
