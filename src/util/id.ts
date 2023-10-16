const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
export function makeId(length: number) {
    let c = ''
    while (c.length < length) {
        c += chars[Math.round(Math.random() * chars.length - 0.5)]
    }
    return c
}
