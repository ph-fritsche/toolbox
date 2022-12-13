import stripAnsi from 'jest-snapshot-serializer-ansi'

expect.addSnapshotSerializer({
    test: value => typeof value === 'string',
    // prevent extra quotes by not calling the next serializer in queue
    print: value => value,
})
expect.addSnapshotSerializer(stripAnsi)
