// Curated catalog for the Advisor. Pure configuration, mirroring the
// applicationHelper/platforms.js style: the matcher, prompts, and UI all read
// this module. Curated picks supply the 10-20% deterministic share of
// suggestions; the AI generates the rest.

const ADVISOR_CATALOG = [
  // --- Software Engineering ---
  {
    id: 'sw-realtime-collab',
    discipline: 'software',
    kind: 'project',
    title: 'Real-time collaborative workspace',
    description: 'Build a multi-user app (notes, whiteboard, or kanban) where edits sync live between browsers, with presence indicators and conflict handling.',
    level: 'intermediate',
    technologies: ['React', 'WebSockets', 'Node.js', 'Redis'],
    outcomes: ['Demonstrates real-time systems thinking beyond CRUD', 'Strong live-demo material for interviews'],
    estimated_weeks: 6,
    tutorials: [
      { title: 'Socket.IO documentation and tutorial', source: 'docs', url: 'https://socket.io/docs/v4/' },
      { title: 'ws: Node.js WebSocket library', source: 'github', url: 'https://github.com/websockets/ws' },
      { title: 'WebSocket chapter on javascript.info', source: 'docs', url: 'https://javascript.info/websocket' },
      { title: 'Yjs shared-editing CRDT framework', source: 'github', url: 'https://github.com/yjs/yjs' },
      { title: 'Fireship real-time app walkthroughs', source: 'youtube', url: 'https://www.youtube.com/@Fireship' },
    ],
  },
  {
    id: 'sw-cli-devtool',
    discipline: 'software',
    kind: 'project',
    title: 'Developer CLI tool published to a package registry',
    description: 'Ship a command-line tool that automates something you do weekly, published to npm or PyPI with tests, docs, and semantic versioning.',
    level: 'beginner',
    technologies: ['Node.js', 'TypeScript'],
    outcomes: ['A real published artifact with download stats', 'Shows packaging, docs, and release discipline'],
    estimated_weeks: 3,
    tutorials: [
      { title: 'Command Line Interface Guidelines', source: 'docs', url: 'https://clig.dev' },
      { title: 'commander.js: Node CLI framework', source: 'github', url: 'https://github.com/tj/commander.js' },
      { title: 'oclif: production CLI framework', source: 'github', url: 'https://github.com/oclif/oclif' },
      { title: 'npm publishing documentation', source: 'docs', url: 'https://docs.npmjs.com' },
      { title: 'dev.to CLI tutorials tag', source: 'devto', url: 'https://dev.to/t/cli' },
    ],
  },
  {
    id: 'sw-distributed-cache',
    discipline: 'software',
    kind: 'project',
    title: 'Distributed key-value cache from scratch',
    description: 'Implement a sharded in-memory cache with consistent hashing, replication, and a benchmark suite comparing it to Redis on your workload.',
    level: 'advanced',
    technologies: ['Go', 'gRPC', 'Docker'],
    outcomes: ['Proves systems-level engineering depth', 'Benchmark write-up doubles as a technical blog post'],
    estimated_weeks: 8,
    tutorials: [
      { title: 'Build your own X (databases, caches)', source: 'github', url: 'https://github.com/codecrafters-io/build-your-own-x' },
      { title: 'Redis documentation', source: 'docs', url: 'https://redis.io/docs/latest/' },
      { title: 'gRPC documentation', source: 'docs', url: 'https://grpc.io/docs/' },
      { title: 'System Design Primer', source: 'github', url: 'https://github.com/donnemartin/system-design-primer' },
      { title: 'Hussein Nasser backend engineering', source: 'youtube', url: 'https://www.youtube.com/@hnasr' },
    ],
  },
  {
    id: 'sw-oss-contribution',
    discipline: 'software',
    kind: 'project',
    title: 'Merged contribution to an open-source library you use',
    description: 'Pick a library from your own stack, fix a real issue or add a documented feature, and get the pull request reviewed and merged.',
    level: 'intermediate',
    technologies: ['Git', 'GitHub'],
    outcomes: ['Public proof you can work in an existing codebase', 'Review feedback from experienced maintainers'],
    estimated_weeks: 4,
    tutorials: [
      { title: 'Open Source Guides by GitHub', source: 'docs', url: 'https://opensource.guide' },
      { title: 'first-contributions practice repo', source: 'github', url: 'https://github.com/firstcontributions/first-contributions' },
      { title: 'Good First Issue project finder', source: 'docs', url: 'https://goodfirstissue.dev' },
      { title: 'GitHub pull request documentation', source: 'docs', url: 'https://docs.github.com/en/pull-requests' },
      { title: 'dev.to open source tag', source: 'devto', url: 'https://dev.to/t/opensource' },
    ],
  },
  {
    id: 'sw-testing-ci-skill',
    discipline: 'software',
    kind: 'skill',
    title: 'Automated testing and CI/CD',
    description: 'Add a meaningful test suite and a CI pipeline (lint, test, build, deploy preview) to one of your existing projects.',
    level: 'intermediate',
    technologies: ['Jest', 'GitHub Actions'],
    outcomes: ['Green-badge repos read as production-ready', 'Interview stories about catching real regressions'],
    estimated_weeks: 2,
    tutorials: [
      { title: 'Jest getting started', source: 'docs', url: 'https://jestjs.io/docs/getting-started' },
      { title: 'GitHub Actions documentation', source: 'docs', url: 'https://docs.github.com/en/actions' },
      { title: 'The Practical Test Pyramid (Fowler)', source: 'docs', url: 'https://martinfowler.com/articles/practical-test-pyramid.html' },
      { title: 'Vitest documentation', source: 'docs', url: 'https://vitest.dev' },
      { title: 'freeCodeCamp testing courses', source: 'youtube', url: 'https://www.youtube.com/@freecodecamp' },
    ],
  },
  {
    id: 'sw-cloud-deploy-skill',
    discipline: 'software',
    kind: 'skill',
    title: 'Cloud deployment and operations',
    description: 'Containerize an existing project and run it on a cloud provider with HTTPS, logs, metrics, and a written incident-recovery runbook.',
    level: 'beginner',
    technologies: ['Docker', 'AWS'],
    outcomes: ['Live URLs make every portfolio project stronger', 'Baseline DevOps literacy employers expect'],
    estimated_weeks: 3,
    tutorials: [
      { title: 'Docker getting started guide', source: 'docs', url: 'https://docs.docker.com/get-started/' },
      { title: 'The Twelve-Factor App', source: 'docs', url: 'https://12factor.net' },
      { title: 'DevOps roadmap', source: 'course', url: 'https://roadmap.sh/devops' },
      { title: 'Render deployment docs', source: 'docs', url: 'https://render.com/docs' },
      { title: 'TechWorld with Nana DevOps tutorials', source: 'youtube', url: 'https://www.youtube.com/@TechWorldwithNana' },
    ],
  },

  // --- Data & Machine Learning ---
  {
    id: 'ml-end-to-end-pipeline',
    discipline: 'data-ml',
    kind: 'project',
    title: 'End-to-end ML pipeline with monitoring',
    description: 'Train, deploy, and monitor a model behind an API: data versioning, experiment tracking, drift detection, and a dashboard of live predictions.',
    level: 'intermediate',
    technologies: ['Python', 'scikit-learn', 'MLflow', 'FastAPI'],
    outcomes: ['Shows MLOps maturity beyond notebook experiments', 'Concrete artifact for ML engineering roles'],
    estimated_weeks: 6,
    tutorials: [
      { title: 'MLflow documentation', source: 'docs', url: 'https://mlflow.org/docs/latest/' },
      { title: 'Made With ML MLOps course', source: 'course', url: 'https://madewithml.com' },
      { title: 'FastAPI documentation', source: 'docs', url: 'https://fastapi.tiangolo.com' },
      { title: 'MLOps Zoomcamp', source: 'github', url: 'https://github.com/DataTalksClub/mlops-zoomcamp' },
      { title: 'ML for Beginners by Microsoft', source: 'github', url: 'https://github.com/microsoft/ML-For-Beginners' },
    ],
  },
  {
    id: 'ml-transfer-learning',
    discipline: 'data-ml',
    kind: 'project',
    title: 'Domain image classifier with transfer learning',
    description: 'Fine-tune a pretrained vision model on a dataset you collect yourself, with an honest error analysis and a small demo app.',
    level: 'beginner',
    technologies: ['PyTorch', 'Python'],
    outcomes: ['Full ML loop: data collection to deployed demo', 'Error analysis shows scientific thinking'],
    estimated_weeks: 4,
    tutorials: [
      { title: 'PyTorch official tutorials', source: 'docs', url: 'https://pytorch.org/tutorials/' },
      { title: 'fast.ai Practical Deep Learning', source: 'course', url: 'https://course.fast.ai' },
      { title: 'Hands-On Machine Learning notebooks', source: 'github', url: 'https://github.com/ageron/handson-ml3' },
      { title: 'StatQuest ML explainers', source: 'youtube', url: 'https://www.youtube.com/@statquest' },
      { title: 'Kaggle Learn micro-courses', source: 'course', url: 'https://www.kaggle.com/learn' },
    ],
  },
  {
    id: 'ml-rag-search',
    discipline: 'data-ml',
    kind: 'project',
    title: 'Retrieval-augmented search over a real corpus',
    description: 'Build semantic search + grounded Q&A over a domain corpus (course notes, datasheets, papers) with citation links and an evaluation set.',
    level: 'advanced',
    technologies: ['Python', 'Embeddings', 'Vector database'],
    outcomes: ['Hands-on LLM systems experience with evaluation rigor', 'Directly relevant to current industry work'],
    estimated_weeks: 6,
    tutorials: [
      { title: 'OpenAI Cookbook', source: 'github', url: 'https://github.com/openai/openai-cookbook' },
      { title: 'Hugging Face free courses', source: 'course', url: 'https://huggingface.co/learn' },
      { title: 'LangChain Python documentation', source: 'docs', url: 'https://python.langchain.com' },
      { title: 'pgvector: Postgres vector search', source: 'github', url: 'https://github.com/pgvector/pgvector' },
      { title: 'dev.to RAG articles', source: 'devto', url: 'https://dev.to/t/rag' },
    ],
  },
  {
    id: 'ml-kaggle-entry',
    discipline: 'data-ml',
    kind: 'project',
    title: 'Documented Kaggle competition entry',
    description: 'Compete in an active competition and publish your feature engineering, validation strategy, and leaderboard progression as a write-up.',
    level: 'intermediate',
    technologies: ['pandas', 'Python'],
    outcomes: ['Benchmarked proof of modeling skill', 'Write-up demonstrates communication ability'],
    estimated_weeks: 5,
    tutorials: [
      { title: 'Kaggle Learn micro-courses', source: 'course', url: 'https://www.kaggle.com/learn' },
      { title: 'pandas documentation', source: 'docs', url: 'https://pandas.pydata.org/docs/' },
      { title: 'Abhishek Thakur Kaggle walkthroughs', source: 'youtube', url: 'https://www.youtube.com/@abhishekkrthakur' },
      { title: 'Approaching (Almost) Any ML Problem', source: 'github', url: 'https://github.com/abhishekkrthakur/approachingalmost' },
      { title: 'scikit-learn user guide', source: 'docs', url: 'https://scikit-learn.org/stable/user_guide.html' },
    ],
  },
  {
    id: 'ml-stats-eval-skill',
    discipline: 'data-ml',
    kind: 'skill',
    title: 'Statistics and model evaluation',
    description: 'Strengthen the evaluation story of an existing project: proper cross-validation, confidence intervals, and an ablation table.',
    level: 'beginner',
    technologies: ['Python', 'scipy'],
    outcomes: ['Separates rigorous work from demo-ware', 'Foundation for every ML interview'],
    estimated_weeks: 3,
    tutorials: [
      { title: '3Blue1Brown math intuition series', source: 'youtube', url: 'https://www.youtube.com/@3blue1brown' },
      { title: 'Google ML crash course', source: 'course', url: 'https://developers.google.com/machine-learning/crash-course' },
      { title: 'Seeing Theory visual statistics', source: 'docs', url: 'https://seeing-theory.brown.edu' },
      { title: 'SciPy statistics documentation', source: 'docs', url: 'https://docs.scipy.org/doc/scipy/' },
      { title: 'Khan Academy statistics & probability', source: 'course', url: 'https://www.khanacademy.org/math/statistics-probability' },
    ],
  },
  {
    id: 'ml-sql-pipeline-skill',
    discipline: 'data-ml',
    kind: 'skill',
    title: 'SQL and data pipelines',
    description: 'Design a warehouse schema and a scheduled pipeline that ingests a public data feed, with data-quality checks and documentation.',
    level: 'intermediate',
    technologies: ['SQL', 'Airflow'],
    outcomes: ['Data engineering literacy most ML students lack', 'Pipelines are asked about in every data interview'],
    estimated_weeks: 4,
    tutorials: [
      { title: 'SQLBolt interactive lessons', source: 'course', url: 'https://sqlbolt.com' },
      { title: 'Mode SQL tutorial', source: 'course', url: 'https://mode.com/sql-tutorial' },
      { title: 'Apache Airflow documentation', source: 'docs', url: 'https://airflow.apache.org/docs/' },
      { title: 'Data Engineering Zoomcamp', source: 'github', url: 'https://github.com/DataTalksClub/data-engineering-zoomcamp' },
      { title: 'dev.to data engineering tag', source: 'devto', url: 'https://dev.to/t/dataengineering' },
    ],
  },

  // --- Electrical Engineering ---
  {
    id: 'ee-sensor-pcb',
    discipline: 'electrical',
    kind: 'project',
    title: 'Custom sensor PCB from schematic to firmware',
    description: 'Design, fabricate, and bring up a microcontroller sensor board: schematic capture, layout, assembly, and firmware that streams readings.',
    level: 'intermediate',
    technologies: ['KiCad', 'STM32', 'C'],
    outcomes: ['Physical hardware photos + design files are standout portfolio evidence', 'Covers the full EE workflow employers screen for'],
    estimated_weeks: 8,
    tutorials: [
      { title: 'KiCad documentation', source: 'docs', url: 'https://docs.kicad.org' },
      { title: 'SparkFun electronics tutorials', source: 'docs', url: 'https://learn.sparkfun.com' },
      { title: "Phil's Lab hardware design videos", source: 'youtube', url: 'https://www.youtube.com/@PhilsLab' },
      { title: 'STMicroelectronics firmware examples', source: 'github', url: 'https://github.com/STMicroelectronics' },
      { title: 'Adafruit guides', source: 'docs', url: 'https://learn.adafruit.com' },
    ],
  },
  {
    id: 'ee-bench-supply',
    discipline: 'electrical',
    kind: 'project',
    title: 'Bench power supply build and characterization',
    description: 'Build a regulated linear supply, then characterize load regulation, ripple, and thermal behavior with plots of real measurements.',
    level: 'beginner',
    technologies: ['LTspice', 'Oscilloscope'],
    outcomes: ['Measurement plots prove bench competence', 'Classic first hardware project done rigorously'],
    estimated_weeks: 4,
    tutorials: [
      { title: 'GreatScott! electronics builds', source: 'youtube', url: 'https://www.youtube.com/@greatscottlab' },
      { title: 'EEVblog bench fundamentals', source: 'youtube', url: 'https://www.youtube.com/@EEVblog' },
      { title: 'CircuitBread electronics tutorials', source: 'docs', url: 'https://www.circuitbread.com' },
      { title: 'Falstad interactive circuit simulator', source: 'docs', url: 'https://www.falstad.com/circuit/' },
      { title: 'Khan Academy electrical engineering', source: 'course', url: 'https://www.khanacademy.org/science/electrical-engineering' },
    ],
  },
  {
    id: 'ee-fpga-dsp',
    discipline: 'electrical',
    kind: 'project',
    title: 'FPGA signal-processing accelerator',
    description: 'Implement a streaming DSP block (FIR filter or FFT) on an FPGA, verified against a software model, with throughput benchmarks.',
    level: 'advanced',
    technologies: ['Verilog', 'FPGA'],
    outcomes: ['Digital design depth beyond coursework', 'Verification methodology is a differentiator'],
    estimated_weeks: 8,
    tutorials: [
      { title: 'HDLBits Verilog practice problems', source: 'course', url: 'https://hdlbits.01xz.net/wiki/Main_Page' },
      { title: 'Nandland FPGA tutorials', source: 'docs', url: 'https://nandland.com' },
      { title: 'fpga4fun project tutorials', source: 'docs', url: 'https://www.fpga4fun.com' },
      { title: 'Project F: FPGA graphics from scratch', source: 'github', url: 'https://github.com/projf/projf-explore' },
      { title: 'ChipVerify Verilog reference', source: 'docs', url: 'https://www.chipverify.com' },
    ],
  },
  {
    id: 'ee-iot-node',
    discipline: 'electrical',
    kind: 'project',
    title: 'Low-power IoT sensor node',
    description: 'Build a battery-powered wireless sensor with measured sleep currents and a dashboard, documenting the power budget honestly.',
    level: 'intermediate',
    technologies: ['ESP32', 'MQTT', 'C'],
    outcomes: ['Power-budget analysis shows real engineering tradeoffs', 'Bridges hardware and cloud skills'],
    estimated_weeks: 5,
    tutorials: [
      { title: 'Random Nerd Tutorials ESP32 guides', source: 'docs', url: 'https://randomnerdtutorials.com' },
      { title: 'Espressif ESP-IDF documentation', source: 'docs', url: 'https://docs.espressif.com' },
      { title: 'MQTT Essentials by HiveMQ', source: 'docs', url: 'https://www.hivemq.com/mqtt-essentials/' },
      { title: 'ESPHome firmware project', source: 'github', url: 'https://github.com/esphome/esphome' },
      { title: 'Andreas Spiess IoT channel', source: 'youtube', url: 'https://www.youtube.com/@AndreasSpiess' },
    ],
  },
  {
    id: 'ee-rtos-firmware-skill',
    discipline: 'electrical',
    kind: 'skill',
    title: 'Production-style embedded firmware',
    description: 'Restructure a firmware project around an RTOS with tasks, queues, a hardware-abstraction layer, and unit tests running in CI.',
    level: 'advanced',
    technologies: ['C', 'FreeRTOS'],
    outcomes: ['Separates hobbyist sketches from professional firmware', 'RTOS experience is a common job requirement'],
    estimated_weeks: 4,
    tutorials: [
      { title: 'FreeRTOS documentation', source: 'docs', url: 'https://www.freertos.org' },
      { title: 'Memfault Interrupt embedded blog', source: 'docs', url: 'https://interrupt.memfault.com' },
      { title: 'Embedded Artistry articles', source: 'docs', url: 'https://embeddedartistry.com' },
      { title: 'Shawn Hymel RTOS video series', source: 'youtube', url: 'https://www.youtube.com/@ShawnHymel' },
      { title: 'Awesome Embedded resource list', source: 'github', url: 'https://github.com/nhivp/Awesome-Embedded' },
    ],
  },
  {
    id: 'ee-instrumentation-skill',
    discipline: 'electrical',
    kind: 'skill',
    title: 'Bench instrumentation and debugging',
    description: 'Document a real debugging session: scope captures, logic-analyzer traces, and the hypothesis-test loop that found the fault.',
    level: 'beginner',
    technologies: ['Oscilloscope', 'Logic analyzer'],
    outcomes: ['Debugging stories are interview gold', 'Shows systematic lab methodology'],
    estimated_weeks: 2,
    tutorials: [
      { title: 'w2aew oscilloscope techniques', source: 'youtube', url: 'https://www.youtube.com/@w2aew' },
      { title: 'EEVblog test equipment reviews', source: 'youtube', url: 'https://www.youtube.com/@EEVblog' },
      { title: 'Learnabout Electronics test-gear modules', source: 'docs', url: 'https://learnabout-electronics.org' },
      { title: 'sigrok logic-analyzer software', source: 'docs', url: 'https://sigrok.org' },
      { title: 'Tektronix learning center', source: 'docs', url: 'https://www.tek.com/en/learning' },
    ],
  },

  // --- Mechanical Engineering ---
  {
    id: 'me-cad-package',
    discipline: 'mechanical',
    kind: 'project',
    title: 'Full CAD and drawing package for a real assembly',
    description: 'Reverse-engineer or design a multi-part assembly with parametric models, exploded views, BOM, and toleranced drawings.',
    level: 'beginner',
    technologies: ['SolidWorks'],
    outcomes: ['A complete drawing package reads as job-ready CAD skill', 'Foundation for every later mechanical project'],
    estimated_weeks: 4,
    tutorials: [
      { title: 'TooTallToby CAD practice models', source: 'youtube', url: 'https://www.youtube.com/@TooTallToby' },
      { title: 'GrabCAD tutorials', source: 'docs', url: 'https://grabcad.com/tutorials' },
      { title: 'Onshape Learning Center', source: 'course', url: 'https://learn.onshape.com' },
      { title: 'FreeCAD wiki', source: 'docs', url: 'https://wiki.freecad.org' },
      { title: 'Engineers Edge design reference', source: 'docs', url: 'https://www.engineersedge.com' },
    ],
  },
  {
    id: 'me-fea-bracket',
    discipline: 'mechanical',
    kind: 'project',
    title: 'FEA-optimized part validated by physical testing',
    description: 'Optimize a load-bearing part with FEA, print or machine it, and compare predicted vs measured failure — including where the model was wrong.',
    level: 'intermediate',
    technologies: ['ANSYS', '3D printing'],
    outcomes: ['Simulation-vs-reality comparison shows engineering judgment', 'Physical test rig makes great visual evidence'],
    estimated_weeks: 6,
    tutorials: [
      { title: 'Ansys Innovation Courses', source: 'course', url: 'https://courses.ansys.com' },
      { title: 'The Efficient Engineer FEA explainers', source: 'youtube', url: 'https://www.youtube.com/@TheEfficientEngineer' },
      { title: 'SimScale documentation', source: 'docs', url: 'https://www.simscale.com/docs/' },
      { title: 'MIT OpenCourseWare mechanics courses', source: 'course', url: 'https://ocw.mit.edu' },
      { title: 'Hubs 3D printing knowledge base', source: 'docs', url: 'https://www.hubs.com/knowledge-base/' },
    ],
  },
  {
    id: 'me-cfd-study',
    discipline: 'mechanical',
    kind: 'project',
    title: 'CFD study with experimental correlation',
    description: 'Run a CFD analysis (duct, wing section, or heat sink) and correlate against experimental or published data with mesh-convergence evidence.',
    level: 'advanced',
    technologies: ['CFD', 'ANSYS Fluent'],
    outcomes: ['Convergence + validation discipline is what separates real CFD from pictures', 'Strong evidence for thermal/fluids roles'],
    estimated_weeks: 8,
    tutorials: [
      { title: 'CFD Online community and wiki', source: 'docs', url: 'https://www.cfd-online.com' },
      { title: 'OpenFOAM documentation', source: 'docs', url: 'https://www.openfoam.com/documentation/' },
      { title: 'Fluid Mechanics 101 CFD lectures', source: 'youtube', url: 'https://www.youtube.com/@fluidmechanics101' },
      { title: 'Ansys Innovation Courses', source: 'course', url: 'https://courses.ansys.com' },
      { title: "NASA Beginner's Guide to Aeronautics", source: 'docs', url: 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/' },
    ],
  },
  {
    id: 'me-mechatronic-mechanism',
    discipline: 'mechanical',
    kind: 'project',
    title: 'Motorized mechanism with closed-loop control',
    description: 'Design and build a mechanism (gimbal, linkage, or turret) with sensor feedback, tuning documentation, and a demo video.',
    level: 'intermediate',
    technologies: ['CAD', 'Arduino', 'Stepper motors'],
    outcomes: ['Crosses into mechatronics, widening your role options', 'Demo videos dramatically boost portfolio engagement'],
    estimated_weeks: 6,
    tutorials: [
      { title: 'Arduino official documentation', source: 'docs', url: 'https://docs.arduino.cc' },
      { title: '507 Mechanical Movements animated', source: 'docs', url: 'https://507movements.com' },
      { title: 'James Bruton robot build logs', source: 'youtube', url: 'https://www.youtube.com/@jamesbruton' },
      { title: 'How To Mechatronics tutorials', source: 'docs', url: 'https://howtomechatronics.com' },
      { title: 'GrabCAD tutorials', source: 'docs', url: 'https://grabcad.com/tutorials' },
    ],
  },
  {
    id: 'me-dfm-skill',
    discipline: 'mechanical',
    kind: 'skill',
    title: 'Design for manufacturing',
    description: 'Redesign one of your parts for a real process (CNC or injection molding), with quotes, tolerance stack-up, and cost analysis.',
    level: 'intermediate',
    technologies: ['CNC', 'Injection molding'],
    outcomes: ['Cost-aware design is what industry actually wants', 'Quote comparison shows commercial awareness'],
    estimated_weeks: 3,
    tutorials: [
      { title: 'Hubs manufacturing knowledge base', source: 'docs', url: 'https://www.hubs.com/knowledge-base/' },
      { title: 'Protolabs design tips', source: 'docs', url: 'https://www.protolabs.com/resources/design-tips/' },
      { title: 'Xometry manufacturing resources', source: 'docs', url: 'https://www.xometry.com/resources/' },
      { title: 'Slant 3D production printing channel', source: 'youtube', url: 'https://www.youtube.com/@slant3d' },
      { title: 'CustomPartNet process encyclopedia', source: 'docs', url: 'https://www.custompartnet.com' },
    ],
  },
  {
    id: 'me-gdt-skill',
    discipline: 'mechanical',
    kind: 'skill',
    title: 'GD&T and technical drawings',
    description: 'Apply geometric dimensioning and tolerancing to an existing assembly: datum strategy, critical features, and inspection notes.',
    level: 'beginner',
    technologies: ['GD&T'],
    outcomes: ['A drawing that survives a design review', 'Frequently screened for in mechanical interviews'],
    estimated_weeks: 2,
    tutorials: [
      { title: 'GD&T Basics guides', source: 'docs', url: 'https://www.gdandtbasics.com' },
      { title: 'Engineers Edge GD&T reference', source: 'docs', url: 'https://www.engineersedge.com' },
      { title: 'GD&T overview (Wikipedia)', source: 'docs', url: 'https://en.wikipedia.org/wiki/Geometric_dimensioning_and_tolerancing' },
      { title: 'Onshape drawings courses', source: 'course', url: 'https://learn.onshape.com' },
      { title: 'MIT OpenCourseWare design courses', source: 'course', url: 'https://ocw.mit.edu' },
    ],
  },

  // --- Robotics & Autonomous Systems ---
  {
    id: 'ro-slam-robot',
    discipline: 'robotics',
    kind: 'project',
    title: 'Autonomous mapping robot',
    description: 'Build a mobile robot that maps a room and navigates to goals: SLAM, costmaps, and recovery behaviors, with a narrated demo run.',
    level: 'intermediate',
    technologies: ['ROS 2', 'Lidar', 'SLAM'],
    outcomes: ['The canonical proof of real robotics capability', 'Touches perception, planning, and control in one artifact'],
    estimated_weeks: 8,
    tutorials: [
      { title: 'Articulated Robotics mobile-robot series', source: 'docs', url: 'https://articulatedrobotics.xyz' },
      { title: 'Articulated Robotics video builds', source: 'youtube', url: 'https://www.youtube.com/@ArticulatedRobotics' },
      { title: 'Nav2 navigation documentation', source: 'docs', url: 'https://docs.nav2.org' },
      { title: 'slam_toolbox', source: 'github', url: 'https://github.com/SteveMacenski/slam_toolbox' },
      { title: 'ROS 2 documentation and tutorials', source: 'docs', url: 'https://docs.ros.org' },
    ],
  },
  {
    id: 'ro-line-follower',
    discipline: 'robotics',
    kind: 'project',
    title: 'Sensor-fusion line follower with tuned PID',
    description: 'Build a fast line follower and document the control loop: sensor calibration, PID tuning curves, and lap-time progression.',
    level: 'beginner',
    technologies: ['Arduino', 'PID'],
    outcomes: ['Tuning documentation turns a toy into an engineering artifact', 'Approachable entry into closed-loop control'],
    estimated_weeks: 3,
    tutorials: [
      { title: 'Arduino official documentation', source: 'docs', url: 'https://docs.arduino.cc' },
      { title: 'Brian Douglas control systems videos', source: 'youtube', url: 'https://www.youtube.com/@BrianBDouglas' },
      { title: 'How To Mechatronics tutorials', source: 'docs', url: 'https://howtomechatronics.com' },
      { title: 'SparkFun electronics tutorials', source: 'docs', url: 'https://learn.sparkfun.com' },
      { title: 'Pololu robotics guides and parts', source: 'docs', url: 'https://www.pololu.com' },
    ],
  },
  {
    id: 'ro-vision-arm',
    discipline: 'robotics',
    kind: 'project',
    title: 'Vision-guided pick-and-place arm',
    description: 'Combine a camera and a robot arm (or simulated arm) to detect, grasp, and sort objects, with a success-rate evaluation table.',
    level: 'advanced',
    technologies: ['ROS 2', 'OpenCV', 'MoveIt'],
    outcomes: ['Manipulation + perception is a hiring hotspot', 'Success-rate metrics show experimental discipline'],
    estimated_weeks: 8,
    tutorials: [
      { title: 'MoveIt motion-planning docs', source: 'docs', url: 'https://moveit.ros.org' },
      { title: 'OpenCV documentation', source: 'docs', url: 'https://docs.opencv.org' },
      { title: 'PythonRobotics algorithm collection', source: 'github', url: 'https://github.com/AtsushiSakai/PythonRobotics' },
      { title: 'PyImageSearch computer-vision tutorials', source: 'docs', url: 'https://pyimagesearch.com' },
      { title: 'ROS-Industrial training material', source: 'github', url: 'https://github.com/ros-industrial/industrial_training' },
    ],
  },
  {
    id: 'ro-sim-pipeline',
    discipline: 'robotics',
    kind: 'project',
    title: 'Sim-first robot behavior in Gazebo',
    description: 'Develop and test a robot behavior entirely in simulation with automated scenario tests, then document the sim-to-real gaps.',
    level: 'intermediate',
    technologies: ['Gazebo', 'ROS 2', 'Python'],
    outcomes: ['Simulation workflow mirrors how robotics teams actually work', 'No hardware budget required'],
    estimated_weeks: 5,
    tutorials: [
      { title: 'Gazebo simulation docs', source: 'docs', url: 'https://gazebosim.org/docs' },
      { title: 'Articulated Robotics simulation guides', source: 'docs', url: 'https://articulatedrobotics.xyz' },
      { title: 'The Construct ROS courses', source: 'course', url: 'https://www.theconstruct.ai' },
      { title: 'ros2_control framework', source: 'github', url: 'https://github.com/ros-controls/ros2_control' },
      { title: 'Automatic Addison robotics tutorials', source: 'docs', url: 'https://automaticaddison.com' },
    ],
  },
  {
    id: 'ro-control-theory-skill',
    discipline: 'robotics',
    kind: 'skill',
    title: 'Control theory in practice',
    description: 'Take one system you built from PID to a modeled controller: system identification, state-space design, and measured step responses.',
    level: 'advanced',
    technologies: ['MATLAB', 'Python'],
    outcomes: ['Theory-to-hardware evidence very few students have', 'Directly maps to controls-engineer interviews'],
    estimated_weeks: 4,
    tutorials: [
      { title: 'Engineering Media control theory maps', source: 'docs', url: 'https://engineeringmedia.com' },
      { title: 'Brian Douglas control systems videos', source: 'youtube', url: 'https://www.youtube.com/@BrianBDouglas' },
      { title: 'Steve Brunton control bootcamp', source: 'youtube', url: 'https://www.youtube.com/@Eigensteve' },
      { title: 'Underactuated Robotics (MIT)', source: 'course', url: 'https://underactuated.mit.edu' },
      { title: 'python-control library', source: 'github', url: 'https://github.com/python-control/python-control' },
    ],
  },
  {
    id: 'ro-ros2-skill',
    discipline: 'robotics',
    kind: 'skill',
    title: 'ROS 2 fundamentals',
    description: 'Structure a robot codebase as proper ROS 2 packages: nodes, launch files, parameters, and a rosbag-based regression test.',
    level: 'beginner',
    technologies: ['ROS 2', 'Python'],
    outcomes: ['ROS 2 is the lingua franca of robotics teams', 'Package structure shows software maturity'],
    estimated_weeks: 3,
    tutorials: [
      { title: 'ROS 2 official tutorials', source: 'docs', url: 'https://docs.ros.org' },
      { title: 'Articulated Robotics ROS 2 videos', source: 'youtube', url: 'https://www.youtube.com/@ArticulatedRobotics' },
      { title: 'The Construct ROS courses', source: 'course', url: 'https://www.theconstruct.ai' },
      { title: 'ROS 2 example packages', source: 'github', url: 'https://github.com/ros2/examples' },
      { title: 'Robotics Back-End ROS 2 guides', source: 'docs', url: 'https://roboticsbackend.com' },
    ],
  },

  // --- Biological & Chemical Engineering ---
  {
    id: 'bc-variant-pipeline',
    discipline: 'bio-chem',
    kind: 'project',
    title: 'Genomic variant-calling pipeline',
    description: 'Build a reproducible pipeline on public sequencing data: QC, alignment, variant calling, and an annotated report, fully containerized.',
    level: 'intermediate',
    technologies: ['Python', 'Biopython', 'Docker'],
    outcomes: ['Reproducibility is the credibility currency of bioinformatics', 'Public-data projects avoid lab-access barriers'],
    estimated_weeks: 6,
    tutorials: [
      { title: 'Galaxy Training bioinformatics lessons', source: 'course', url: 'https://training.galaxyproject.org' },
      { title: 'sandbox.bio interactive terminal tutorials', source: 'course', url: 'https://sandbox.bio' },
      { title: 'nf-core community pipelines', source: 'docs', url: 'https://nf-co.re' },
      { title: 'Biopython project', source: 'docs', url: 'https://biopython.org' },
      { title: 'Awesome Bioinformatics list', source: 'github', url: 'https://github.com/danielecook/Awesome-Bioinformatics' },
    ],
  },
  {
    id: 'bc-quantified-assay',
    discipline: 'bio-chem',
    kind: 'project',
    title: 'Quantified assay write-up with statistical analysis',
    description: 'Turn a lab experiment into a portfolio piece: protocol, raw data, error analysis, and statistically honest conclusions with plots.',
    level: 'beginner',
    technologies: ['Python', 'Statistics'],
    outcomes: ['Shows you treat lab work as data, not ritual', 'Template for documenting all future experiments'],
    estimated_weeks: 3,
    tutorials: [
      { title: 'Khan Academy biology', source: 'course', url: 'https://www.khanacademy.org/science/biology' },
      { title: 'protocols.io method repository', source: 'docs', url: 'https://www.protocols.io' },
      { title: 'LibreTexts chemistry library', source: 'docs', url: 'https://chem.libretexts.org' },
      { title: 'Data Carpentry lessons', source: 'course', url: 'https://datacarpentry.org' },
      { title: 'Matplotlib documentation', source: 'docs', url: 'https://matplotlib.org' },
    ],
  },
  {
    id: 'bc-protein-ml',
    discipline: 'bio-chem',
    kind: 'project',
    title: 'Protein property prediction model',
    description: 'Train a model predicting a protein property from sequence using public datasets, benchmarked against published baselines.',
    level: 'advanced',
    technologies: ['Python', 'PyTorch'],
    outcomes: ['Computational biology depth at the ML frontier', 'Benchmark comparison demonstrates scientific rigor'],
    estimated_weeks: 8,
    tutorials: [
      { title: 'Rosalind bioinformatics problems', source: 'course', url: 'https://rosalind.info' },
      { title: 'Hugging Face free courses', source: 'course', url: 'https://huggingface.co/learn' },
      { title: 'ColabFold protein structure notebooks', source: 'github', url: 'https://github.com/sokrypton/ColabFold' },
      { title: 'DeepChem library and tutorials', source: 'github', url: 'https://github.com/deepchem/deepchem' },
      { title: 'PDB-101 structural biology education', source: 'docs', url: 'https://pdb101.rcsb.org' },
    ],
  },
  {
    id: 'bc-process-sim',
    discipline: 'bio-chem',
    kind: 'project',
    title: 'Chemical process simulation and sensitivity study',
    description: 'Model a reaction or separation process, run parameter sensitivity analysis, and present the operating-window tradeoffs.',
    level: 'intermediate',
    technologies: ['MATLAB', 'Python'],
    outcomes: ['Process thinking valued across chem-eng roles', 'Sensitivity analysis shows quantitative judgment'],
    estimated_weeks: 5,
    tutorials: [
      { title: 'LibreTexts engineering library', source: 'docs', url: 'https://eng.libretexts.org' },
      { title: 'MIT OpenCourseWare chemical engineering', source: 'course', url: 'https://ocw.mit.edu' },
      { title: 'Cantera chemical kinetics toolkit', source: 'docs', url: 'https://cantera.org' },
      { title: 'MATLAB Onramp free courses', source: 'course', url: 'https://matlabacademy.mathworks.com' },
      { title: 'SciPy documentation', source: 'docs', url: 'https://docs.scipy.org/doc/scipy/' },
    ],
  },
  {
    id: 'bc-data-analysis-skill',
    discipline: 'bio-chem',
    kind: 'skill',
    title: 'Quantitative analysis in Python or R',
    description: 'Re-analyze one of your past lab datasets with scripted, versioned analysis instead of spreadsheets, publishing the notebook.',
    level: 'beginner',
    technologies: ['Python', 'R'],
    outcomes: ['Scripted analysis is the biggest gap in bio/chem portfolios', 'Every later project builds on this'],
    estimated_weeks: 2,
    tutorials: [
      { title: 'Software Carpentry lessons', source: 'course', url: 'https://software-carpentry.org' },
      { title: 'R for Data Science book', source: 'docs', url: 'https://r4ds.hadley.nz' },
      { title: 'pandas documentation', source: 'docs', url: 'https://pandas.pydata.org/docs/' },
      { title: 'swirl: learn R inside R', source: 'docs', url: 'https://swirlstats.com' },
      { title: 'dev.to data science tag', source: 'devto', url: 'https://dev.to/t/datascience' },
    ],
  },
  {
    id: 'bc-instrumentation-skill',
    discipline: 'bio-chem',
    kind: 'skill',
    title: 'Instrumentation and spectra interpretation',
    description: 'Document an instrumentation workflow (spectroscopy or chromatography): calibration, acquisition, and scripted peak analysis.',
    level: 'intermediate',
    technologies: ['Spectroscopy', 'Python'],
    outcomes: ['Instrument fluency plus data skills is a rare combination', 'Concrete evidence for analytical-lab roles'],
    estimated_weeks: 3,
    tutorials: [
      { title: 'LibreTexts analytical chemistry', source: 'docs', url: 'https://chem.libretexts.org' },
      { title: 'Royal Society of Chemistry education', source: 'docs', url: 'https://edu.rsc.org' },
      { title: 'Khan Academy chemistry', source: 'course', url: 'https://www.khanacademy.org/science/chemistry' },
      { title: 'Open Chemistry software projects', source: 'github', url: 'https://github.com/OpenChemistry' },
      { title: 'Chemguide spectroscopy explanations', source: 'docs', url: 'https://www.chemguide.co.uk' },
    ],
  },
];

const LEVELS = ['beginner', 'intermediate', 'advanced'];

// horizontal growth strengthens the current level; vertical growth targets one
// level up (capped at advanced).
const targetLevelFor = (analysis, goals) => {
  const current = LEVELS.includes(analysis.estimated_level) ? analysis.estimated_level : 'beginner';
  if ((goals || {}).growth !== 'vertical') return current;
  return LEVELS[Math.min(LEVELS.indexOf(current) + 1, LEVELS.length - 1)];
};

// Curated share of suggestions: top 1-2 projects + 1 skill for the user's
// discipline, at the level their growth goal targets. The AI generates the
// remaining ~80-90%.
const matchCatalogEntries = ({ analysis = {}, goals = {}, limit = 3 } = {}) => {
  const targetLevel = targetLevelFor(analysis, goals);
  const byLevelFit = (a, b) =>
    Math.abs(LEVELS.indexOf(a.level) - LEVELS.indexOf(targetLevel))
    - Math.abs(LEVELS.indexOf(b.level) - LEVELS.indexOf(targetLevel));

  const inDiscipline = ADVISOR_CATALOG.filter((entry) => entry.discipline === analysis.primary_discipline);
  const projects = inDiscipline.filter((entry) => entry.kind === 'project').sort(byLevelFit)
    .slice(0, Math.max(1, Math.min(2, limit - 1)))
    .filter((entry) => entry.level === targetLevel || inDiscipline.every((other) => other.kind !== 'project' || other.level !== targetLevel));
  const skills = inDiscipline.filter((entry) => entry.kind === 'skill').sort(byLevelFit).slice(0, 1);

  return [...projects, ...skills].slice(0, limit).map((entry) => ({
    ...entry,
    source: 'curated',
    match_reason: entry.level === targetLevel
      ? `Curated pick: matches your primary discipline at your ${targetLevel}-level growth target.`
      : 'Curated pick: matches your primary discipline.',
  }));
};

// Curated tutorials ranked by technology overlap — the composed learning path
// when no online tutorial matches an AI suggestion. Overlap is scored across
// the whole catalog (a ROS project matters more than discipline lines); the
// primary discipline is a tie-break so zero-overlap requests stay on-topic.
const GENERIC_TECHS = new Set(['python', 'c++', 'javascript', 'matlab', 'java']);

const curatedTutorialsFor = ({ discipline, technologies = [], limit = 3 } = {}) => {
  const techText = technologies.map((tech) => String(tech).toLowerCase()).join(' ');
  const ranked = ADVISOR_CATALOG
    .map((entry) => ({
      entry,
      overlap: entry.technologies.filter((tech) => {
        const needle = String(tech).toLowerCase();
        // Single-letter technologies (R, C) would substring-match any text,
        // and generic languages say nothing about the topic.
        return needle.length >= 2 && !GENERIC_TECHS.has(needle) && techText.includes(needle);
      }).length * 2 + (entry.discipline === discipline ? 1 : 0),
    }))
    .filter(({ entry, overlap }) => overlap > 0 || entry.discipline === discipline)
    .sort((a, b) => b.overlap - a.overlap);

  const seen = new Set();
  const tutorials = [];
  for (const { entry } of ranked) {
    for (const tutorial of entry.tutorials || []) {
      if (tutorials.length >= limit) return tutorials;
      if (seen.has(tutorial.url)) continue;
      seen.add(tutorial.url);
      tutorials.push(tutorial);
    }
  }
  return tutorials;
};

module.exports = { ADVISOR_CATALOG, curatedTutorialsFor, matchCatalogEntries };
