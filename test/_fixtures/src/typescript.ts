export function echoFoo(
    input: string,
) {
    if (input.startsWith('b')) {
        return input
    } else {
        return 'foo'
    }
}

export function error() {
    throw new Error('some error')
}
