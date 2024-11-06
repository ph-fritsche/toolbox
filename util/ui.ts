import { results, setupMockTester } from './MockConductor'

const {cli} = await setupMockTester(results)

await cli.open()
