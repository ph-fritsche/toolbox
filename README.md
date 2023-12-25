# Toolbox

Collection of loosely coupled units for testing libraries in multiple environments.

## Usage

Each unit is designed to be replaceable if your project or environment requires a different setup.
For the "default" usage there are setup functions that reduce the boilerplate.

```js
import { setupSourceModuleLoader, setupToolboxTester, setupNodeConductor, setupChromeConductor, serveDir } from '@ph.fritsche/toolbox'

const tester = await setupToolboxTester(
    [ // Watched files
        'src',
        'test'
    ],
    [ // Test coductors
        setupNodeConductor('Node, Dependency version X', [
            new URL('http://path/to/setup/fileX.js'),
        ]),
        setupNodeConductor('Node, Dependency version Y', [
            new URL('http://path/to/setup/fileY.js'),
        ]),
        setupChromeConductor('Chrome, Dependency version X', [
            new URL('http://path/to/setup/fileX.js'),
        ]),
    ],
    [ // Loaders which e.g. transform TS to JS
        await setupSourceModuleLoader()
    ],
)

// Run the tests with each of the conductors and report combined results
await tester.start()
```

## Design

```mermaid
graph
    FS[(FS)]
    FsWatcher
    Manager[TestRunManager]
    Conductor[TestConductor]
    Run(TestRunStack)
    RunInstance(TestRunInstance)
    Suite(TestSuite)
    subgraph TargetEnv[Target environment]
        Runner[TestRunner]
        SetupFiles[(Setup module)]
        TestSuiteFile[(Test suite file)]
        Test([Test])
        ReporterClient(TestReporterClient)
        Imports[(Imported module)]
    end
    ReporterServer(TestReporterServer)
    RunnerServer
    FileServer
    FileProvider
    FileLoader


    FsWatcher -- watch --> FS
    FsWatcher -- report list of files --> mapToTestFile[[map to test suite files]] --> Manager
    Manager -- create --> Run
    Manager -- filter/exec --> Suite
    Run --- RunInstance
    RunInstance --- Conductor
    RunInstance --- Suite
    Suite -- delegate execution --> Conductor
    Conductor -- launch target environment --> TargetEnv
    Conductor ---- ReporterServer
    Conductor -- load --> Runner
    Conductor -- load --> SetupFiles
    Conductor -- load --> TestSuiteFile
    TestSuiteFile -- create --> Test
    RunnerServer -- serves --> Runner
    FileServer -- serves --> TestSuiteFile
    FileServer -. serves .-> Imports
    FileServer ---- FileProvider
    FsWatcher -- invalidates --> FileProvider
    FileProvider ---- FileLoader
    FileLoader -- load and transform --> FS
    TestSuiteFile -- import --> Imports
    Runner -- execute --> Test
    Runner -- report --> ReporterClient
    ReporterClient -- report --> ReporterServer
    ReporterServer -- report --> Suite
```