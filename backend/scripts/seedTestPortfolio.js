const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../config/database');

const TARGET_EMAIL = 'test.portfolio@example.com';
const TARGET_USERNAME = 'testportfolio';
const LEGACY_USERNAME = 'test.portfolio';
const TARGET_PASSWORD = 'TestPortfolio123!';

const FRONTEND_ASSET_DIR = path.join(__dirname, '..', '..', 'frontend', 'public', 'test-assets', 'test-portfolio');
const ASSET_BASE_URL = '/test-assets/test-portfolio';

const imageSources = {
  fpga: 'https://upload.wikimedia.org/wikipedia/commons/9/9d/Mojo_v3_FPGA_Development_Board_%289303578174%29.jpg',
  arduino: 'https://upload.wikimedia.org/wikipedia/commons/3/38/Arduino_Uno_-_R3.jpg',
  esp32: 'https://upload.wikimedia.org/wikipedia/commons/1/1d/ESP32_Espressif_ESP-WROOM-32_Dev_Board_%282%29.jpg',
  stm32: 'https://upload.wikimedia.org/wikipedia/commons/7/7a/STM32F4_Discovery_%289067300323%29.jpg',
  camera: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Raspberry_Pi_Camera_Module_v2_with_ribbon.jpg',
  logic: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/8_Channel_USB_logic_analyzer_%285172098012%29.jpg',
  scope: 'https://upload.wikimedia.org/wikipedia/commons/9/92/Oscilloscope_Tektronix_7854.jpg',
  pcb: 'https://upload.wikimedia.org/wikipedia/commons/6/67/RS_42471-12_PCB_02.jpg',
  emg: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Muscle_Whistler_with_EMG_surface_electrodes_%281971%29.jpg',
  riscv: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/RISC-V-logo-square.svg',
};

const videoSources = {
  fpga: 'https://www.youtube.com/watch?v=QJ-vseSB95Y',
  riscv: 'https://www.youtube.com/watch?v=2F8w6uLrYlY',
  sensorMesh: 'https://www.youtube.com/watch?v=x5A5S0hoyJ0',
  motor: 'https://www.youtube.com/watch?v=0jK4JGhhrNY',
  logic: 'https://www.youtube.com/watch?v=qokYcnGZOxE',
  vision: 'https://www.youtube.com/watch?v=x65h9wK38Q4',
  emg: 'https://www.youtube.com/watch?v=NaddDbWjNbs',
};

const sourceLinks = [
  ...Object.values(imageSources),
  ...Object.values(videoSources),
  'https://riscv.org/technical/specifications/',
];

const skills = [
  'Verilog',
  'SystemVerilog',
  'FPGA',
  'RISC-V',
  'C',
  'C++',
  'Python',
  'Embedded Linux',
  'FreeRTOS',
  'ESP32',
  'STM32',
  'PCB Design',
  'KiCad',
  'ROS 2',
  'OpenCV',
  'MQTT',
  'CAN Bus',
  'Control Systems',
  'Signal Processing',
  'GitHub Actions',
];

const html = (...parts) => parts.join('');
const paragraph = (text) => `<p>${text}</p>`;
const heading = (text, level = 2) => ({ type: 'heading', content: { text, level } });
const textBlock = (body) => ({ type: 'text', content: { html: body } });
const imageBlock = (url, caption, alt) => ({ type: 'image', content: { url, caption, alt } });
const videoBlock = (url, caption) => ({ type: 'video', content: { url, caption } });
const codeBlock = (language, code) => ({ type: 'code', content: { language, code } });
const divider = () => ({ type: 'divider', content: {} });
const callout = (text) => ({ type: 'callout', content: { emoji: 'i', text } });
const metrics = (items) => ({ type: 'metrics', content: { items } });
const table = (headers, rows) => ({ type: 'table', content: { headers, rows } });
const timeline = (items) => ({ type: 'timeline', content: { items } });
const gallery = (images) => ({ type: 'gallery', content: { images } });

const asset = (filename) => {
  const localPath = path.join(FRONTEND_ASSET_DIR, filename);
  const size = fs.existsSync(localPath) ? fs.statSync(localPath).size : 0;
  return { filename, url: `${ASSET_BASE_URL}/${filename}`, size };
};

const fileBlock = (filename, displayName = filename) => {
  const file = asset(filename);
  return {
    type: 'file',
    content: {
      filename: displayName,
      url: file.url,
      size: file.size,
    },
  };
};

const projects = [
  {
    title: 'FPGA Traffic Controller and Pedestrian Safety Core',
    slug: 'fpga-traffic-controller',
    tagline: 'A Verilog finite-state-machine traffic controller with synchronized inputs, safe fallback states, and timing closure notes.',
    description: 'A digital design project focused on real hardware constraints: synchronizing noisy external inputs, proving state transitions, and closing timing on an FPGA development board.',
    cover_image_url: imageSources.fpga,
    project_type: 'Hardware + HDL',
    technologies: ['Verilog', 'FPGA', 'Digital Logic', 'FSM', 'Testbenches', 'Timing Analysis'],
    collaborators: ['EEE 333 lab partner review', 'ASU hardware study group'],
    start_date: '2025-09-04',
    end_date: '2025-11-18',
    github_url: 'https://github.com/testportfolio-asu/fpga-traffic-controller',
    live_url: 'https://example.com/testportfolio/fpga-traffic-controller',
    is_featured: true,
    view_count: 426,
    blocks: [
      heading('Problem'),
      textBlock(html(
        paragraph('The controller models a two-way campus intersection with vehicle loop sensors, a pedestrian request latch, maintenance override, and an all-red recovery branch. I treated this as a safety-oriented digital design exercise rather than a blinking-LED demo.'),
        '<ul><li>All asynchronous buttons and sensors pass through two-stage synchronizers.</li><li>The pedestrian request is latched until the protected walk phase completes.</li><li>Illegal FSM states fall back to all-red before returning to normal operation.</li></ul>'
      )),
      imageBlock(imageSources.fpga, 'Reference FPGA development board image from Wikimedia Commons used for the seeded demo.', 'FPGA development board'),
      metrics([
        { value: '3.1', unit: 'ns', label: 'Worst positive slack' },
        { value: '42', unit: '', label: 'Directed test cases' },
        { value: '50', unit: 'MHz', label: 'Target clock' },
      ]),
      heading('Architecture'),
      table(
        ['Module', 'Responsibility', 'Verification'],
        [
          ['sensor_sync', 'Debounce and synchronize external inputs', 'Metastability and pulse-width tests'],
          ['phase_fsm', 'Own signal phase transitions', 'Directed transition coverage'],
          ['ped_latch', 'Hold crosswalk requests', 'Latch clear and priority tests'],
          ['fault_guard', 'Recover from invalid states', 'Forced illegal-state simulation'],
        ]
      ),
      codeBlock('verilog', [
        'always @(posedge clk) begin',
        '  if (rst || illegal_state) begin',
        '    state <= ALL_RED;',
        '  end else begin',
        '    state <= next_state;',
        '  end',
        'end',
        '',
        'assign walk_enable = (state == PED_WALK) && ped_request_latched;',
      ].join('\n')),
      videoBlock(videoSources.fpga, 'Related FPGA FSM/traffic-controller demonstration video.'),
      timeline([
        { date: 'Week 1', title: 'State diagram', description: 'Defined vehicle and pedestrian phases with all-red guard timing.' },
        { date: 'Week 2', title: 'Simulation', description: 'Built directed tests for sensor edges, maintenance override, and illegal-state recovery.' },
        { date: 'Week 3', title: 'Hardware run', description: 'Mapped outputs to LEDs and checked timing closure on the FPGA toolchain.' },
      ]),
      fileBlock('fpga-timing-report.md', 'fpga-timing-report.md'),
    ],
  },
  {
    title: 'RV32I Pipeline Simulator and Hazard Visualizer',
    slug: 'rv32i-pipeline-simulator',
    tagline: 'A five-stage RISC-V simulator that visualizes forwarding, stalls, branch flushes, and cycle-level benchmark behavior.',
    description: 'A systems-software project that made pipeline hazards visible through a small simulator, regression suite, and CSV benchmark reports.',
    cover_image_url: imageSources.riscv,
    project_type: 'Systems Software',
    technologies: ['RISC-V', 'C++', 'Python', 'Computer Architecture', 'CLI Tools', 'CSV Analysis'],
    collaborators: ['Computer architecture study group'],
    start_date: '2025-10-10',
    end_date: '2025-12-08',
    github_url: 'https://github.com/testportfolio-asu/rv32i-pipeline-sim',
    live_url: 'https://example.com/testportfolio/rv32i-pipeline-sim',
    is_featured: true,
    view_count: 318,
    blocks: [
      heading('Overview'),
      textBlock(html(
        paragraph('This simulator implements a compact RV32I subset with IF, ID, EX, MEM, and WB stages. The goal was to explain why a pipeline stalls, not just compute the final register state.'),
        '<ul><li>Cycle-by-cycle trace output for each pipeline stage.</li><li>Forwarding from EX/MEM and MEM/WB where legal.</li><li>Load-use detection with a one-cycle bubble.</li><li>Branch flush metrics in the benchmark summary.</li></ul>'
      )),
      imageBlock(imageSources.riscv, 'RISC-V logo reference from Wikimedia Commons.', 'RISC-V logo'),
      metrics([
        { value: '43/43', unit: '', label: 'Hazard tests passing' },
        { value: '0.81', unit: 'IPC', label: 'Best benchmark IPC' },
        { value: '64', unit: 'cycles', label: 'Timer interrupt latency' },
      ]),
      heading('Trace Format'),
      codeBlock('text', [
        'cycle 184:',
        '  IF  pc=0x00000120 inst=lw x7, 0(x10)',
        '  ID  pc=0x0000011c inst=add x6, x6, x5',
        '  EX  bubble=load_use',
        '  MEM pc=0x00000118 inst=lw x5, 4(x10)',
        '  WB  x4 <- 0x0000002a',
      ].join('\n')),
      table(
        ['Hazard', 'Behavior', 'Regression case'],
        [
          ['EX to EX forwarding', 'Bypass ALU result into next ALU op', 'add_sub_chain.S'],
          ['Load-use', 'Insert one bubble before dependent instruction', 'lw_add_stall.S'],
          ['Taken branch', 'Flush IF/ID and restart fetch', 'beq_loop_flush.S'],
          ['Timer trap', 'Save PC and jump to handler vector', 'mtime_interrupt.S'],
        ]
      ),
      videoBlock(videoSources.riscv, 'Related RISC-V pipeline demonstration video.'),
      callout('The strongest lesson from this project was that readable instrumentation is a feature. The trace output made it much easier to find wrong forwarding decisions than stepping through raw register dumps.'),
      fileBlock('riscv-benchmark-results.csv', 'riscv-benchmark-results.csv'),
    ],
  },
  {
    title: 'Sun Devil Rover Telemetry Stack',
    slug: 'sun-devil-rover-telemetry',
    tagline: 'A rover telemetry pipeline combining CAN packets, Raspberry Pi logging, and a real-time dashboard for field debugging.',
    description: 'A robotics-adjacent embedded systems project focused on making sensor and drivetrain data observable during outdoor tests.',
    cover_image_url: imageSources.camera,
    project_type: 'Robotics + Telemetry',
    technologies: ['Python', 'ROS 2', 'CAN Bus', 'WebSockets', 'Raspberry Pi', 'Telemetry'],
    collaborators: ['Rover mock team', 'ASU makerspace testers'],
    start_date: '2026-01-12',
    end_date: '2026-03-22',
    github_url: 'https://github.com/testportfolio-asu/rover-telemetry-stack',
    live_url: 'https://example.com/testportfolio/rover-telemetry',
    is_featured: true,
    view_count: 284,
    blocks: [
      heading('Field Debugging Problem'),
      textBlock(html(
        paragraph('During rover tests, the useful data is often split across serial logs, battery readings, controller debug output, and someone watching the wheels. I designed this stack to collect the data into one time-aligned stream.'),
        '<ul><li>CAN frames are normalized into a typed telemetry packet.</li><li>A Raspberry Pi bridge writes local logs and forwards WebSocket updates.</li><li>The dashboard highlights voltage sag, link quality, and motor imbalance.</li></ul>'
      )),
      gallery([
        { url: imageSources.camera, caption: 'Reference Raspberry Pi camera module image from Wikimedia Commons.' },
        { url: imageSources.arduino, caption: 'Reference microcontroller board image used for test media.' },
        { url: imageSources.scope, caption: 'Reference lab instrumentation image for debug context.' },
      ]),
      metrics([
        { value: '20', unit: 'Hz', label: 'Telemetry rate' },
        { value: '7', unit: '', label: 'Core packet fields' },
        { value: '500', unit: 'kbps', label: 'CAN bus speed' },
      ]),
      heading('Packet Contract'),
      codeBlock('json', JSON.stringify({
        packet: 'sun-devil-rover.telemetry.v1',
        battery_voltage: 14.8,
        motor_left_rpm: 126,
        motor_right_rpm: 121,
        imu_yaw: 42.7,
        link_rssi: -61,
      }, null, 2)),
      table(
        ['Subsystem', 'Signal', 'Dashboard use'],
        [
          ['Power', 'battery_voltage', 'Warn below 13.2 V under load'],
          ['Drive', 'left/right RPM', 'Detect traction mismatch'],
          ['Navigation', 'imu_yaw', 'Overlay heading in field log'],
          ['Radio', 'link_rssi', 'Explain telemetry dropouts'],
        ]
      ),
      timeline([
        { date: 'Jan 2026', title: 'Protocol draft', description: 'Defined a small packet schema and binary-to-JSON bridge.' },
        { date: 'Feb 2026', title: 'Dashboard pass', description: 'Built a WebSocket dashboard with live voltage and motor traces.' },
        { date: 'Mar 2026', title: 'Field replay', description: 'Added log replay to debug a dropped-link test after the run.' },
      ]),
      fileBlock('rover-telemetry-schema.json', 'rover-telemetry-schema.json'),
    ],
  },
  {
    title: 'ESP32 Smart Dorm Sensor Mesh',
    slug: 'esp32-smart-dorm-sensor-mesh',
    tagline: 'A low-power ESP32 mesh that reports room comfort, battery state, and calibration health through MQTT.',
    description: 'An IoT project that balances firmware, wireless reliability, sensor calibration, and a lightweight dashboard.',
    cover_image_url: imageSources.esp32,
    project_type: 'IoT + Firmware',
    technologies: ['ESP32', 'FreeRTOS', 'MQTT', 'C', 'Python', 'Grafana', 'Low Power'],
    collaborators: ['Dorm automation prototype group'],
    start_date: '2025-11-03',
    end_date: '2026-02-14',
    github_url: 'https://github.com/testportfolio-asu/esp32-dorm-mesh',
    live_url: 'https://example.com/testportfolio/esp32-dorm-mesh',
    is_featured: false,
    view_count: 241,
    blocks: [
      heading('Design Goal'),
      textBlock(html(
        paragraph('The mesh is a realistic version of a dorm-room sensor project: every node can sleep, wake, sample, publish, and receive OTA updates without needing a laptop plugged into it.'),
        '<ul><li>MQTT topics are organized by building, room, and node ID.</li><li>Calibration offsets are tracked separately from firmware versions.</li><li>Nodes report battery sleep current so power regressions are visible.</li></ul>'
      )),
      imageBlock(imageSources.esp32, 'Reference ESP32 development board image from Wikimedia Commons.', 'ESP32 development board'),
      metrics([
        { value: '18', unit: 'uA', label: 'Best sleep current' },
        { value: '5', unit: '', label: 'Prototype nodes' },
        { value: '2.4', unit: 's', label: 'OTA reconnect time' },
      ]),
      codeBlock('c', [
        'void publish_sample(sensor_sample_t sample) {',
        '  char topic[96];',
        '  snprintf(topic, sizeof(topic), "asu/dorm/%s/%s", room_id, node_id);',
        '  mqtt_publish_json(topic, sample_to_json(sample));',
        '  enter_deep_sleep(sample.next_wake_seconds);',
        '}',
      ].join('\n')),
      videoBlock(videoSources.sensorMesh, 'Related ESP32 MQTT dashboard demonstration video.'),
      table(
        ['Topic', 'Payload', 'Purpose'],
        [
          ['asu/dorm/a1/temp', 'temperature_c', 'Comfort history'],
          ['asu/dorm/a1/battery', 'voltage + sleep current', 'Power tracking'],
          ['asu/dorm/a1/status', 'firmware + RSSI', 'Node health'],
        ]
      ),
      fileBlock('sensor-mesh-calibration.csv', 'sensor-mesh-calibration.csv'),
    ],
  },
  {
    title: 'BLDC Motor Driver and PID Test Bench',
    slug: 'bldc-motor-driver-pid-test-bench',
    tagline: 'A motor-control bench with STM32 firmware, current sensing, PID tuning, and oscilloscope-driven bring-up notes.',
    description: 'A hardware-software project centered on driver bring-up, measurement, and control-loop iteration.',
    cover_image_url: imageSources.stm32,
    project_type: 'Controls + PCB',
    technologies: ['STM32', 'C', 'PID Control', 'PWM', 'ADC', 'KiCad', 'Oscilloscope'],
    collaborators: ['Controls lab partner review'],
    start_date: '2026-02-20',
    end_date: '2026-04-28',
    github_url: 'https://github.com/testportfolio-asu/bldc-pid-bench',
    live_url: 'https://example.com/testportfolio/bldc-pid-bench',
    is_featured: false,
    view_count: 197,
    blocks: [
      heading('Bring-Up Strategy'),
      textBlock(html(
        paragraph('The project started with a simple question: can the controller hold a repeatable target speed without hiding electrical problems under software? I split the work into power-stage checks, sensor validation, and then closed-loop tuning.'),
        '<ul><li>ADC current readings are filtered before the PID loop.</li><li>PWM outputs stay disabled until current-sense offsets are calibrated.</li><li>Scope captures are treated as test artifacts, not just screenshots.</li></ul>'
      )),
      gallery([
        { url: imageSources.stm32, caption: 'Reference STM32 discovery board image from Wikimedia Commons.' },
        { url: imageSources.scope, caption: 'Reference oscilloscope image for measurement context.' },
        { url: imageSources.pcb, caption: 'Reference PCB image used for seeded test media.' },
      ]),
      metrics([
        { value: '1.8', unit: 'ms', label: 'Settling target' },
        { value: '20', unit: 'kHz', label: 'PWM carrier' },
        { value: '3', unit: '', label: 'Current sense channels' },
      ]),
      codeBlock('c', [
        'float pid_step(pid_t *pid, float target, float measured, float dt) {',
        '  const float err = target - measured;',
        '  pid->integral = clamp(pid->integral + err * dt, -pid->i_limit, pid->i_limit);',
        '  const float derivative = (err - pid->prev_err) / dt;',
        '  pid->prev_err = err;',
        '  return pid->kp * err + pid->ki * pid->integral + pid->kd * derivative;',
        '}',
      ].join('\n')),
      videoBlock(videoSources.motor, 'Related STM32/BLDC motor-control demonstration video.'),
      fileBlock('motor-driver-bom.csv', 'motor-driver-bom.csv'),
    ],
  },
  {
    title: 'FPGA UART Logic Analyzer',
    slug: 'fpga-uart-logic-analyzer',
    tagline: 'A small FPGA capture core that decodes UART traffic into a FIFO and verifies output with a Python golden decoder.',
    description: 'A digital instrumentation project built to make serial debugging less opaque.',
    cover_image_url: imageSources.logic,
    project_type: 'Digital Instrumentation',
    technologies: ['Verilog', 'FPGA', 'UART', 'Python', 'FIFO', 'Signal Capture'],
    collaborators: ['Embedded debug workshop'],
    start_date: '2026-03-02',
    end_date: '2026-04-06',
    github_url: 'https://github.com/testportfolio-asu/fpga-uart-logic-analyzer',
    live_url: 'https://example.com/testportfolio/uart-logic-analyzer',
    is_featured: false,
    view_count: 162,
    blocks: [
      heading('What It Captures'),
      textBlock(html(
        paragraph('The analyzer samples an RX line, detects start bits, oversamples each byte, and stores decoded frames into a FIFO for host-side export. I used a Python decoder as the reference implementation.'),
        '<ul><li>Three-sample majority filter for start-bit detection.</li><li>Configurable baud divider generated from the system clock.</li><li>Regression captures compare FPGA and Python decoder output.</li></ul>'
      )),
      imageBlock(imageSources.logic, 'Reference USB logic analyzer image from Wikimedia Commons.', 'USB logic analyzer'),
      metrics([
        { value: '24', unit: 'MHz', label: 'Sample clock' },
        { value: '115200', unit: 'baud', label: 'Default UART' },
        { value: '12', unit: '', label: 'Regression captures' },
      ]),
      heading('Decoder Core'),
      codeBlock('verilog', [
        'if (sample_tick) begin',
        '  shift_reg <= {rx_sync, shift_reg[7:1]};',
        '  bit_count <= bit_count + 1;',
        '  if (bit_count == 8) begin',
        '    fifo_write <= 1;',
        '    fifo_data <= {rx_sync, shift_reg[7:1]};',
        '  end',
        'end',
      ].join('\n')),
      videoBlock(videoSources.logic, 'Related FPGA UART/logic-analyzer demonstration video.'),
      table(
        ['Capture', 'Expected', 'Result'],
        [
          ['gps_uart_boot_message', '$GPGGA prefix', 'Pass'],
          ['baud_error_plus_2pct', 'Frame tolerance', 'Pass'],
          ['short_glitch_rx_idle', 'Ignore false start', 'Pass'],
        ]
      ),
      fileBlock('logic-analyzer-capture.txt', 'logic-analyzer-capture.txt'),
    ],
  },
  {
    title: 'Edge Vision Occupancy Counter',
    slug: 'edge-vision-occupancy-counter',
    tagline: 'A Raspberry Pi computer-vision prototype that counts room entries locally and publishes privacy-friendly aggregate events.',
    description: 'An edge AI project focused on running useful CV on limited hardware without uploading raw video.',
    cover_image_url: imageSources.camera,
    project_type: 'Computer Vision',
    technologies: ['Python', 'OpenCV', 'Raspberry Pi', 'Edge AI', 'SQLite', 'Metrics'],
    collaborators: ['Human-centered sensing prototype review'],
    start_date: '2026-01-25',
    end_date: '2026-03-11',
    github_url: 'https://github.com/testportfolio-asu/edge-vision-occupancy',
    live_url: 'https://example.com/testportfolio/edge-vision-occupancy',
    is_featured: false,
    view_count: 211,
    blocks: [
      heading('Privacy-First Constraint'),
      textBlock(html(
        paragraph('The prototype keeps raw frames on device and only publishes aggregate occupancy events. That constraint shaped the architecture: lightweight detection, simple tracking, and local evaluation logs.'),
        '<ul><li>Frames are processed locally and discarded after inference.</li><li>Only count deltas, confidence, and scene health metrics are persisted.</li><li>Evaluation focuses on precision, recall, and FPS across lighting conditions.</li></ul>'
      )),
      imageBlock(imageSources.camera, 'Reference Raspberry Pi camera module image from Wikimedia Commons.', 'Raspberry Pi camera module'),
      metrics([
        { value: '24.8', unit: 'fps', label: 'Best scene throughput' },
        { value: '0.94', unit: '', label: 'Best precision' },
        { value: '4', unit: '', label: 'Evaluation scenes' },
      ]),
      codeBlock('python', [
        'for detection in detections:',
        '    if detection.confidence < threshold:',
        '        continue',
        '    track = tracker.update(detection.box)',
        '    if crossing_line(track.previous, track.current):',
        '        publish_count_delta(track.direction, detection.confidence)',
      ].join('\n')),
      videoBlock(videoSources.vision, 'Related Raspberry Pi/OpenCV people-counting demonstration video.'),
      table(
        ['Scene', 'Precision', 'Recall', 'FPS'],
        [
          ['Lab entry day', '0.94', '0.91', '24.8'],
          ['Hallway backlight', '0.87', '0.83', '22.1'],
          ['Makerspace night', '0.89', '0.80', '19.4'],
        ]
      ),
      fileBlock('vision-evaluation-summary.csv', 'vision-evaluation-summary.csv'),
    ],
  },
  {
    title: 'Secure OTA Bootloader for Cortex-M',
    slug: 'secure-ota-bootloader-cortex-m',
    tagline: 'A firmware update flow with signed images, anti-rollback checks, A/B slots, and failure recovery notes.',
    description: 'A security-minded embedded firmware project that treats update reliability as part of the threat model.',
    cover_image_url: imageSources.pcb,
    project_type: 'Embedded Security',
    technologies: ['C', 'Cortex-M', 'Firmware Security', 'Ed25519', 'Flash Memory', 'Threat Modeling'],
    collaborators: ['Embedded security reading group'],
    start_date: '2026-04-05',
    end_date: '2026-05-15',
    github_url: 'https://github.com/testportfolio-asu/secure-ota-bootloader',
    live_url: 'https://example.com/testportfolio/secure-ota-bootloader',
    is_featured: false,
    view_count: 183,
    blocks: [
      heading('Security Goals'),
      textBlock(html(
        paragraph('This project models a safe over-the-air update path for a microcontroller product. The bootloader verifies the staged image before swapping slots and refuses older firmware versions after a successful update.'),
        '<ul><li>Ed25519 signatures verify image authenticity.</li><li>A monotonic firmware version blocks rollback attempts.</li><li>A/B slots preserve one known-good image during power loss.</li><li>The updater records reason codes for failed boots.</li></ul>'
      )),
      imageBlock(imageSources.pcb, 'Reference PCB image from Wikimedia Commons used for seeded test media.', 'Printed circuit board'),
      metrics([
        { value: '2', unit: '', label: 'Flash slots' },
        { value: '64', unit: 'B', label: 'Signature size' },
        { value: '4', unit: '', label: 'Main abuse cases modeled' },
      ]),
      heading('Verification Flow'),
      codeBlock('c', [
        'bool boot_candidate_is_valid(const image_header_t *header) {',
        '  if (header->version <= read_rollback_counter()) return false;',
        '  if (!hash_matches_image(header)) return false;',
        '  if (!ed25519_verify(header->signature, header->hash, public_key)) return false;',
        '  return true;',
        '}',
      ].join('\n')),
      timeline([
        { date: 'Phase 1', title: 'Threat model', description: 'Mapped update abuse cases and recovery requirements.' },
        { date: 'Phase 2', title: 'Image format', description: 'Defined a small signed image header and hash flow.' },
        { date: 'Phase 3', title: 'Swap logic', description: 'Added A/B slots, boot confirmation, and rollback counter checks.' },
      ]),
      table(
        ['Threat', 'Mitigation', 'Test'],
        [
          ['Replay older firmware', 'Monotonic anti-rollback counter', 'Version downgrade rejected'],
          ['Modify image in transit', 'Signature and hash verification', 'Tampered payload rejected'],
          ['Power loss during swap', 'A/B slot with boot confirmation', 'Forced reset recovery'],
        ]
      ),
      fileBlock('bootloader-threat-model.md', 'bootloader-threat-model.md'),
    ],
  },
  {
    title: 'Wearable EMG Gesture Controller',
    slug: 'wearable-emg-gesture-controller',
    tagline: 'A wearable prototype that filters EMG signals, extracts simple features, and classifies hand gestures for BLE control.',
    description: 'A signal-processing and embedded ML prototype connecting analog sensing, feature extraction, and a small wireless control interface.',
    cover_image_url: imageSources.emg,
    project_type: 'Wearables + Signal Processing',
    technologies: ['Signal Processing', 'Embedded ML', 'BLE', 'Python', 'Arduino', 'Feature Extraction'],
    collaborators: ['Bioinstrumentation project peer review'],
    start_date: '2026-03-20',
    end_date: '2026-05-02',
    github_url: 'https://github.com/testportfolio-asu/emg-gesture-controller',
    live_url: 'https://example.com/testportfolio/emg-gesture-controller',
    is_featured: false,
    view_count: 149,
    blocks: [
      heading('Prototype Scope'),
      textBlock(html(
        paragraph('The controller explores a practical EMG pipeline: acquire a noisy muscle signal, filter it, compute lightweight features, and classify a small gesture set on constrained hardware.'),
        '<ul><li>Feature set includes RMS, zero-crossing count, mean absolute value, and waveform length.</li><li>Gesture classes include rest, open hand, fist, pinch, and two-finger point.</li><li>BLE messages expose only gesture state, not raw signal streams.</li></ul>'
      )),
      imageBlock(imageSources.emg, 'Reference EMG surface-electrode image from Wikimedia Commons used for seeded test media.', 'EMG surface electrodes'),
      metrics([
        { value: '5', unit: '', label: 'Gesture classes' },
        { value: '0.94', unit: '', label: 'Best active-class accuracy' },
        { value: '4', unit: '', label: 'Time-domain features' },
      ]),
      heading('Feature Extraction'),
      codeBlock('python', [
        'def features(window):',
        '    centered = window - window.mean()',
        '    return {',
        '        "rms": np.sqrt(np.mean(centered ** 2)),',
        '        "mav": np.mean(np.abs(centered)),',
        '        "zc": np.sum(np.diff(np.signbit(centered)) != 0),',
        '        "wl": np.sum(np.abs(np.diff(centered))),',
        '    }',
      ].join('\n')),
      videoBlock(videoSources.emg, 'Related EMG gesture-control demonstration video.'),
      table(
        ['Gesture', 'Samples', 'Accuracy'],
        [
          ['Rest', '420', '0.98'],
          ['Open hand', '390', '0.93'],
          ['Fist', '410', '0.94'],
          ['Pinch', '360', '0.89'],
        ]
      ),
      fileBlock('emg-training-log.csv', 'emg-training-log.csv'),
    ],
  },
];

const portfolioSettings = {
  theme: 'clean',
  accent_color: '#8C1D40',
  font_choice: 'inter',
  layout: 'classic',
  show_contact_form: true,
  show_github_stats: false,
  seo_title: 'Ari Patel - Computer Engineering Portfolio',
  seo_description: 'Computer engineering portfolio for Ari Patel, an Arizona State University student focused on embedded systems, FPGA design, robotics telemetry, IoT, and edge AI.',
  seo_keywords: ['computer engineering', 'Arizona State University', 'FPGA', 'embedded systems', 'RISC-V', 'IoT', 'robotics', 'edge AI'],
  is_public: true,
  show_skills: true,
  show_dates: true,
  show_project_type: true,
  section_order: ['header', 'focus-snapshot', 'projects', 'engineering-process', 'education', 'endorsements', 'contact'],
  section_config: {
    header: { spacing: 'spacious', bg: 'tint' },
    projects: { columns: '3', card_style: 'rounded', spacing: 'normal', show_tagline: true },
    contact: { bg: 'tint' },
    education: {
      credentials: [
        {
          id: 'asu-bse',
          type: 'degree',
          title: 'B.S.E. Computer Engineering',
          institution: 'Arizona State University',
          field: 'Embedded systems, digital design, and computer architecture',
          honors: 'Expected May 2027',
          year_start: '2023',
          year_end: 'Present',
          url: 'https://www.asu.edu/',
        },
        {
          id: 'ece-hardware-labs',
          type: 'course',
          title: 'Digital Design and Embedded Systems Labs',
          institution: 'Arizona State University',
          field: 'FPGA, MCU firmware, instrumentation',
          honors: 'Selected lab portfolio',
          year_start: '2025',
          year_end: '2026',
        },
      ],
    },
  },
  site_sections: [
    {
      id: 'focus-snapshot',
      type: 'stats',
      title: 'Engineering Snapshot',
      subtitle: 'A quick read on the portfolio focus.',
      variant: 'editorialNumbers',
      layout: { columns: 4, density: 'comfortable' },
      content: {
        items: [
          { value: '9', label: 'documented projects' },
          { value: '5', label: 'hardware-heavy builds' },
          { value: '4', label: 'software systems builds' },
          { value: '20+', label: 'tools and technologies' },
        ],
      },
    },
    {
      id: 'engineering-process',
      type: 'process',
      title: 'How I Build',
      subtitle: 'The same pattern shows up across the hardware and software work.',
      variant: 'cards',
      layout: { columns: 3, density: 'comfortable' },
      content: {
        items: [
          { step: '01', title: 'Model the interface', text: 'Define packets, states, timing budgets, and data contracts before writing the bulk of the code.' },
          { step: '02', title: 'Instrument early', text: 'Add traces, scope captures, CSV exports, and dashboard signals so bugs become visible.' },
          { step: '03', title: 'Verify with artifacts', text: 'Keep timing reports, benchmark tables, threat models, and evaluation logs attached to the project.' },
        ],
      },
    },
  ],
  design_system: {
    direction: 'engineering',
    tokens: {
      accent: '#8C1D40',
      secondary: '#FFC627',
      surface: '#ffffff',
    },
  },
  interactions: [],
  animations: {
    reveal: 'subtle',
    hoverLift: true,
  },
  theme_overrides: {
    cardBorderRadius: '18px',
    cardShadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
  },
  custom_css: [
    '.pf-name { letter-spacing: 0; }',
    '.pf-project-card { border: 1px solid rgba(15, 23, 42, 0.08); }',
    '.pf-header { border-radius: 28px; }',
  ].join('\n'),
};

const profile = {
  email: TARGET_EMAIL,
  full_name: 'Ari Patel',
  username: TARGET_USERNAME,
  headline: 'Computer Engineering Student at Arizona State University - Embedded Systems, FPGA Design, and Edge AI',
  bio: 'I am a computer engineering student at Arizona State University focused on the space where hardware, firmware, and practical software meet. My projects usually start with a signal, bus, or timing problem and end with something observable: a dashboard, trace, report, or working prototype. I am especially interested in FPGA systems, embedded firmware, robotics telemetry, secure device updates, and edge AI that can run close to the hardware.',
  avatar_url: 'https://robohash.org/testportfolio-asu.png?set=set5&size=240x240',
  location: 'Tempe, Arizona',
  website: 'https://example.com/testportfolio',
  linkedin_url: 'https://www.linkedin.com/in/testportfolio-asu',
  github_url: 'https://github.com/testportfolio-asu',
  resume_url: `${ASSET_BASE_URL}/ari-patel-resume.md`,
  phone: '',
  contact_email: TARGET_EMAIL,
  identity_mode: 'student',
  skills,
};

const discoverPosts = [
  {
    project_slug: 'fpga-traffic-controller',
    title: 'Closed timing on the traffic-controller core',
    body: 'Wrapped up the FPGA traffic-controller pass with positive slack on the 50 MHz clock and a cleaner illegal-state recovery path. The all-red watchdog branch made the state machine easier to reason about.',
    post_type: 'update',
    context: 'build_log',
    metadata: { looking_for: ['HDL review', 'FSM testing ideas'], tags: ['fpga', 'verilog', 'timing'] },
  },
  {
    project_slug: 'rv32i-pipeline-simulator',
    title: 'Pipeline traces are better than final register dumps',
    body: 'The RV32I simulator became much easier to debug after adding a cycle-by-cycle trace. Forwarding mistakes jumped out immediately once every stage had a readable label.',
    post_type: 'resource',
    context: 'resource',
    external_url: 'https://riscv.org/technical/specifications/',
    metadata: { looking_for: ['architecture feedback'], tags: ['risc-v', 'computer-architecture'] },
  },
  {
    project_slug: 'esp32-smart-dorm-sensor-mesh',
    title: 'ESP32 mesh calibration notes',
    body: 'The latest sensor-mesh run found a small humidity offset between nodes. Keeping calibration data outside firmware made it possible to correct dashboards without reflashing every device.',
    post_type: 'feedback_request',
    context: 'feedback',
    metadata: { looking_for: ['low-power firmware tips', 'dashboard UX feedback'], tags: ['esp32', 'mqtt', 'iot'] },
  },
  {
    project_slug: 'secure-ota-bootloader-cortex-m',
    title: 'Threat model pass for the OTA bootloader',
    body: 'Finished a first pass at the OTA bootloader threat model: rollback, tampered images, interrupted swaps, and battery-drain abuse. The A/B slot flow is more code, but the recovery story is much stronger.',
    post_type: 'update',
    context: 'research',
    metadata: { looking_for: ['embedded security review'], tags: ['firmware-security', 'bootloader'] },
  },
  {
    project_slug: 'edge-vision-occupancy-counter',
    title: 'Edge vision prototype keeps raw frames local',
    body: 'The occupancy counter now publishes only aggregate count events. The model still needs work in backlit scenes, but the privacy constraint is forcing a cleaner architecture.',
    post_type: 'launch',
    context: 'launch',
    metadata: { looking_for: ['OpenCV tuning ideas', 'edge AI benchmarks'], tags: ['opencv', 'raspberry-pi', 'edge-ai'] },
  },
];

const endorsements = [
  {
    project_slug: 'fpga-traffic-controller',
    from_name: 'Dr. Elena Morales',
    from_email: 'elena.morales@example.edu',
    from_role: 'Digital Design Instructor',
    quote: 'Ari documents engineering tradeoffs clearly. The traffic-controller project shows careful thinking about synchronization, safety states, and verification rather than just a working demo.',
  },
  {
    project_slug: 'sun-devil-rover-telemetry',
    from_name: 'Noah Kim',
    from_email: 'noah.kim@example.edu',
    from_role: 'Robotics project teammate',
    quote: 'The telemetry dashboard made field testing much easier. Ari has a good instinct for turning low-level signals into tools the rest of the team can actually use.',
  },
  {
    project_slug: 'secure-ota-bootloader-cortex-m',
    from_name: 'Priya Shah',
    from_email: 'priya.shah@example.edu',
    from_role: 'Embedded systems peer reviewer',
    quote: 'The bootloader writeup is unusually complete for a student project. The threat model, failure cases, and recovery notes make it feel like a real firmware review.',
  },
];

const tableExists = async (client, tableName) => {
  const result = await client.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
};

const deletePostChildren = async (client, userId) => {
  if (!(await tableExists(client, 'discover_posts'))) return;
  const childTables = ['post_mentions', 'post_media', 'post_saves', 'post_likes', 'post_comments', 'post_stats'];
  for (const tableName of childTables) {
    if (await tableExists(client, tableName)) {
      await client.query(
        `DELETE FROM ${tableName} WHERE post_id IN (SELECT id FROM discover_posts WHERE user_id = $1)`,
        [userId]
      );
    }
  }
  await client.query('DELETE FROM discover_posts WHERE user_id = $1', [userId]);
};

const findOrCreateUser = async (client) => {
  const passwordHash = await bcrypt.hash(TARGET_PASSWORD, 12);
  const existing = await client.query(
    `SELECT id, email, username
       FROM users
      WHERE lower(email) = lower($1) OR username = $2 OR username = $3`,
    [TARGET_EMAIL, TARGET_USERNAME, LEGACY_USERNAME]
  );

  let userId = existing.rows.find((row) => row.email?.toLowerCase() === TARGET_EMAIL)?.id
    || existing.rows.find((row) => row.username === TARGET_USERNAME)?.id
    || existing.rows.find((row) => row.username === LEGACY_USERNAME)?.id;

  const conflicting = existing.rows.filter((row) => row.id !== userId);
  if (conflicting.some((row) => row.username === TARGET_USERNAME || row.email?.toLowerCase() === TARGET_EMAIL)) {
    throw new Error(`Cannot seed ${TARGET_EMAIL}: another account already owns the target email or username.`);
  }

  if (userId) {
    const result = await client.query(
      `UPDATE users
          SET email = $1,
              username = $2,
              password_hash = $3,
              full_name = $4,
              headline = $5,
              bio = $6,
              avatar_url = $7,
              location = $8,
              website = $9,
              linkedin_url = $10,
              github_url = $11,
              resume_url = $12,
              skills = $13::text[],
              is_email_verified = true,
              phone = $14,
              contact_email = $15,
              identity_mode = $16,
              updated_at = NOW()
        WHERE id = $17
        RETURNING id`,
      [
        profile.email,
        profile.username,
        passwordHash,
        profile.full_name,
        profile.headline,
        profile.bio,
        profile.avatar_url,
        profile.location,
        profile.website,
        profile.linkedin_url,
        profile.github_url,
        profile.resume_url,
        profile.skills,
        profile.phone,
        profile.contact_email,
        profile.identity_mode,
        userId,
      ]
    );
    return result.rows[0].id;
  }

  const result = await client.query(
    `INSERT INTO users
      (email, username, password_hash, full_name, headline, bio, avatar_url, location,
       website, linkedin_url, github_url, resume_url, skills, is_email_verified,
       phone, contact_email, identity_mode)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::text[], true, $14, $15, $16)
     RETURNING id`,
    [
      profile.email,
      profile.username,
      passwordHash,
      profile.full_name,
      profile.headline,
      profile.bio,
      profile.avatar_url,
      profile.location,
      profile.website,
      profile.linkedin_url,
      profile.github_url,
      profile.resume_url,
      profile.skills,
      profile.phone,
      profile.contact_email,
      profile.identity_mode,
    ]
  );
  return result.rows[0].id;
};

const upsertPortfolioSettings = async (client, userId) => {
  await client.query(
    `INSERT INTO portfolio_settings
      (user_id, theme, accent_color, font_choice, show_contact_form, show_github_stats,
       seo_title, seo_description, seo_keywords, is_public, layout, section_order,
       show_skills, show_dates, show_project_type, section_config, custom_css,
       custom_js, theme_overrides, animations, site_sections, design_system, interactions,
       manual_custom_css, agent_custom_css, manual_design_overrides, agent_design_meta,
       preferred_ai_model, updated_at)
     VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9::text[], $10, $11, $12::jsonb,
       $13, $14, $15, $16::jsonb, $17, NULL, $18::jsonb, $19::jsonb, $20::jsonb,
       $21::jsonb, $22::jsonb, $23, NULL, '{}'::jsonb, $24::jsonb, $25, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       theme = EXCLUDED.theme,
       accent_color = EXCLUDED.accent_color,
       font_choice = EXCLUDED.font_choice,
       show_contact_form = EXCLUDED.show_contact_form,
       show_github_stats = EXCLUDED.show_github_stats,
       seo_title = EXCLUDED.seo_title,
       seo_description = EXCLUDED.seo_description,
       seo_keywords = EXCLUDED.seo_keywords,
       is_public = EXCLUDED.is_public,
       layout = EXCLUDED.layout,
       section_order = EXCLUDED.section_order,
       show_skills = EXCLUDED.show_skills,
       show_dates = EXCLUDED.show_dates,
       show_project_type = EXCLUDED.show_project_type,
       section_config = EXCLUDED.section_config,
       custom_css = EXCLUDED.custom_css,
       custom_js = NULL,
       theme_overrides = EXCLUDED.theme_overrides,
       animations = EXCLUDED.animations,
       site_sections = EXCLUDED.site_sections,
       design_system = EXCLUDED.design_system,
       interactions = EXCLUDED.interactions,
       manual_custom_css = EXCLUDED.manual_custom_css,
       agent_custom_css = NULL,
       manual_design_overrides = '{}'::jsonb,
       agent_design_meta = EXCLUDED.agent_design_meta,
       preferred_ai_model = EXCLUDED.preferred_ai_model,
       updated_at = NOW()`,
    [
      userId,
      portfolioSettings.theme,
      portfolioSettings.accent_color,
      portfolioSettings.font_choice,
      portfolioSettings.show_contact_form,
      portfolioSettings.show_github_stats,
      portfolioSettings.seo_title,
      portfolioSettings.seo_description,
      portfolioSettings.seo_keywords,
      portfolioSettings.is_public,
      portfolioSettings.layout,
      JSON.stringify(portfolioSettings.section_order),
      portfolioSettings.show_skills,
      portfolioSettings.show_dates,
      portfolioSettings.show_project_type,
      JSON.stringify(portfolioSettings.section_config),
      portfolioSettings.custom_css,
      JSON.stringify(portfolioSettings.theme_overrides),
      JSON.stringify(portfolioSettings.animations),
      JSON.stringify(portfolioSettings.site_sections),
      JSON.stringify(portfolioSettings.design_system),
      JSON.stringify(portfolioSettings.interactions),
      portfolioSettings.custom_css,
      JSON.stringify({ active: false, version: 1, appliedChangeSetIds: [] }),
      'openrouter:nvidia/llama-3.1-nemotron-70b-instruct',
    ]
  );
};

const insertProjects = async (client, userId) => {
  const inserted = new Map();

  for (const [index, project] of projects.entries()) {
    const result = await client.query(
      `INSERT INTO projects
        (user_id, title, slug, tagline, description, cover_image_url, status,
         is_featured, project_type, technologies, collaborators, start_date,
         end_date, github_url, live_url, view_count, sort_order)
       VALUES
        ($1, $2, $3, $4, $5, $6, 'published', $7, $8, $9::text[], $10::text[],
         $11::date, $12::date, $13, $14, $15, $16)
       RETURNING id, slug, title`,
      [
        userId,
        project.title,
        project.slug,
        project.tagline,
        project.description,
        project.cover_image_url,
        project.is_featured,
        project.project_type,
        project.technologies,
        project.collaborators,
        project.start_date,
        project.end_date,
        project.github_url,
        project.live_url,
        project.view_count,
        index,
      ]
    );
    const row = result.rows[0];
    inserted.set(row.slug, row);

    for (const [blockIndex, block] of project.blocks.entries()) {
      await client.query(
        'INSERT INTO blocks (project_id, type, content, sort_order) VALUES ($1, $2, $3::jsonb, $4)',
        [row.id, block.type, JSON.stringify(block.content), blockIndex]
      );
    }
  }

  return inserted;
};

const insertEndorsements = async (client, userId, projectMap) => {
  if (!(await tableExists(client, 'endorsements'))) return 0;

  let count = 0;
  for (const item of endorsements) {
    const projectId = projectMap.get(item.project_slug)?.id || null;
    await client.query(
      `INSERT INTO endorsements
        (token, to_user_id, from_name, from_email, from_role, project_id, quote,
         is_approved, is_rejected, created_at, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, true, false, NOW() - ($8 || ' days')::interval, NOW() - ($8 || ' days')::interval)`,
      [
        randomUUID(),
        userId,
        item.from_name,
        item.from_email,
        item.from_role,
        projectId,
        item.quote,
        11 + count * 3,
      ]
    );
    count += 1;
  }
  return count;
};

const insertDiscoverContent = async (client, userId, projectMap) => {
  if (await tableExists(client, 'discover_user_interests')) {
    await client.query(
      `INSERT INTO discover_user_interests (user_id, contexts, technologies, goals, updated_at)
       VALUES ($1, $2::text[], $3::text[], $4::text[], NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         contexts = EXCLUDED.contexts,
         technologies = EXCLUDED.technologies,
         goals = EXCLUDED.goals,
         updated_at = NOW()`,
      [
        userId,
        ['show', 'feedback', 'research', 'build_log', 'collab'],
        ['FPGA', 'RISC-V', 'Embedded Systems', 'ESP32', 'STM32', 'OpenCV', 'Robotics', 'IoT'],
        ['find embedded systems internships', 'meet hardware collaborators', 'get design review feedback'],
      ]
    );
  }

  if (!(await tableExists(client, 'discover_posts'))) return 0;

  let count = 0;
  for (const item of discoverPosts) {
    const projectId = projectMap.get(item.project_slug)?.id || null;
    const result = await client.query(
      `INSERT INTO discover_posts
        (user_id, project_id, title, body, post_type, context, visibility,
         allow_comments, comment_visibility, status, external_url, metadata,
         spam_score, published_at, created_at, updated_at)
       VALUES
        ($1, $2::uuid, $3, $4, $5, $6, 'public', true, 'public', 'published',
         $7, $8::jsonb, 0.05, NOW() - ($9 || ' days')::interval,
         NOW() - ($9 || ' days')::interval, NOW() - ($9 || ' days')::interval)
       RETURNING id`,
      [
        userId,
        projectId,
        item.title,
        item.body,
        item.post_type,
        item.context,
        item.external_url || null,
        JSON.stringify(item.metadata || {}),
        4 + count * 5,
      ]
    );

    if (await tableExists(client, 'post_stats')) {
      await client.query(
        `INSERT INTO post_stats
          (post_id, like_count, comment_count, save_count, share_count,
           project_click_count, impression_count, helpful_count, trending_score, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (post_id) DO UPDATE SET
           like_count = EXCLUDED.like_count,
           comment_count = EXCLUDED.comment_count,
           save_count = EXCLUDED.save_count,
           share_count = EXCLUDED.share_count,
           project_click_count = EXCLUDED.project_click_count,
           impression_count = EXCLUDED.impression_count,
           helpful_count = EXCLUDED.helpful_count,
           trending_score = EXCLUDED.trending_score,
           updated_at = NOW()`,
        [
          result.rows[0].id,
          8 + count * 2,
          2 + (count % 3),
          3 + count,
          1 + (count % 2),
          12 + count * 4,
          150 + count * 40,
          1 + count,
          12.5 + count,
        ]
      );
    }

    count += 1;
  }

  return count;
};

const updateStats = async (client, userId) => {
  if (!(await tableExists(client, 'user_stats'))) return;
  await client.query(
    `INSERT INTO user_stats
      (user_id, follower_count, following_count, project_count, total_views,
       recent_views, trending_score, updated_at)
     VALUES ($1, 42, 18, $2, 1860, 219, 87.2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       follower_count = EXCLUDED.follower_count,
       following_count = EXCLUDED.following_count,
       project_count = EXCLUDED.project_count,
       total_views = EXCLUDED.total_views,
       recent_views = EXCLUDED.recent_views,
       trending_score = EXCLUDED.trending_score,
       updated_at = NOW()`,
    [userId, projects.length]
  );
};

const clearExistingSeededContent = async (client, userId) => {
  await deletePostChildren(client, userId);
  if (await tableExists(client, 'endorsements')) {
    await client.query('DELETE FROM endorsements WHERE to_user_id = $1', [userId]);
  }
  await client.query('DELETE FROM projects WHERE user_id = $1', [userId]);
};

const verifySeed = async (client, userId) => {
  const result = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM projects WHERE user_id = $1 AND status = 'published') AS projects,
       (SELECT COUNT(*)::int FROM blocks b JOIN projects p ON p.id = b.project_id WHERE p.user_id = $1) AS blocks,
       (SELECT COUNT(*)::int FROM blocks b JOIN projects p ON p.id = b.project_id WHERE p.user_id = $1 AND b.type = 'image') AS image_blocks,
       (SELECT COUNT(*)::int FROM blocks b JOIN projects p ON p.id = b.project_id WHERE p.user_id = $1 AND b.type = 'video') AS video_blocks,
       (SELECT COUNT(*)::int FROM blocks b JOIN projects p ON p.id = b.project_id WHERE p.user_id = $1 AND b.type = 'file') AS file_blocks`,
    [userId]
  );
  return result.rows[0];
};

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userId = await findOrCreateUser(client);
    await clearExistingSeededContent(client, userId);
    await upsertPortfolioSettings(client, userId);
    const projectMap = await insertProjects(client, userId);
    const endorsementCount = await insertEndorsements(client, userId, projectMap);
    const discoverPostCount = await insertDiscoverContent(client, userId, projectMap);
    await updateStats(client, userId);
    const verification = await verifySeed(client, userId);
    await client.query('COMMIT');

    console.log('Seeded fake test portfolio account.');
    console.log(`Email: ${TARGET_EMAIL}`);
    console.log(`Password: ${TARGET_PASSWORD}`);
    console.log(`Username: ${TARGET_USERNAME}`);
    console.log(`Published projects: ${verification.projects}`);
    console.log(`Project blocks: ${verification.blocks}`);
    console.log(`Image/video/file blocks: ${verification.image_blocks}/${verification.video_blocks}/${verification.file_blocks}`);
    console.log(`Endorsements: ${endorsementCount}`);
    console.log(`Discover posts: ${discoverPostCount}`);
    console.log(`External source links used: ${sourceLinks.length}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error('Failed to seed fake test portfolio account.');
  console.error(error.message);
  process.exit(1);
});
