export function echo(
    input: string,
) {
    return input
}

export function error() {
    throw new Error('some error')
}
