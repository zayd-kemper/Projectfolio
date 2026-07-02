// frontend/src/components/shared/TagInput.jsx
// Reusable tag input: type to filter suggestions, Enter/comma to add custom values.
import { useState, useRef, useEffect } from 'react';

// ── SUGGESTION LISTS ──────────────────────────────────────────────────────────

export const TECHNOLOGY_SUGGESTIONS = [
  // Programming Languages
  'Python', 'MATLAB', 'C', 'C++', 'C#', 'Java', 'JavaScript', 'TypeScript',
  'R', 'Julia', 'Fortran', 'Rust', 'Go', 'Swift', 'Kotlin', 'Scala',
  'Arduino (C++)', 'LabVIEW', 'Assembly', 'Bash', 'PowerShell', 'SQL',

  // CAD & Design
  'SolidWorks', 'AutoCAD', 'CATIA', 'Fusion 360', 'Inventor', 'NX (Siemens)',
  'Creo', 'Rhino 3D', 'Blender', 'FreeCAD', 'OpenSCAD', 'Onshape',
  'SketchUp', 'Revit', 'ANSYS SpaceClaim', 'PTC Creo', 'ZBrush',

  // Simulation & Analysis
  'ANSYS', 'ANSYS Fluent', 'ANSYS Mechanical', 'ANSYS Maxwell',
  'COMSOL Multiphysics', 'Abaqus', 'OpenFOAM', 'Star-CCM+', 'Nastran', 'HyperMesh',
  'MATLAB Simulink', 'Simulink', 'Adams', 'LS-DYNA', 'Fluent', 'MSC Adams',

  // Electronics & Embedded
  'KiCad', 'Eagle', 'Altium Designer', 'LTspice', 'Multisim', 'PSpice',
  'Arduino', 'Raspberry Pi', 'STM32', 'ESP32', 'PIC Microcontroller',
  'FPGA', 'Verilog', 'VHDL', 'ROS', 'ROS2', 'PlatformIO',

  // Data & ML
  'TensorFlow', 'PyTorch', 'scikit-learn', 'Keras', 'OpenCV',
  'NumPy', 'Pandas', 'SciPy', 'Matplotlib', 'Seaborn', 'Plotly',
  'Jupyter Notebook', 'Google Colab', 'CUDA', 'JAX', 'Hugging Face Transformers',
  'XGBoost', 'LightGBM',

  // Web & Software
  'React', 'Next.js', 'Node.js', 'Express.js', 'Django', 'Flask', 'FastAPI', 'Spring Boot',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Firebase',
  'Docker', 'Kubernetes', 'AWS', 'Azure', 'Google Cloud Platform',
  'Git', 'GitHub', 'GitLab', 'Bitbucket',
  'Linux', 'Unix',
  'REST API', 'GraphQL', 'WebSockets',

  // DevOps & Infrastructure
  'CI/CD', 'Jenkins', 'GitHub Actions', 'GitLab CI',
  'Terraform', 'Ansible', 'Nginx', 'Apache',
  'Serverless', 'Microservices', 'Load Balancing',

  // Lab & Research Tools
  'ImageJ', 'Origin', 'OriginPro', 'Minitab', 'SPSS', 'Stata',
  'LabVIEW', 'Oscilloscope', 'Signal Analyzer', 'Multimeter', 'Logic Analyzer',
  'DAQ Systems',

  // Manufacturing & Fabrication
  '3D Printing (FDM)', '3D Printing (SLA)', '3D Printing (SLS)',
  'Laser Cutting', 'Waterjet Cutting', 'CNC Machining',
  'Injection Molding', 'Welding', 'PCB Fabrication', 'Soldering',

  // Testing & Quality
  'Wind Tunnel Testing', 'GD&T', 'DFM', 'DFA', 'FMEA', 'SPC', 'Six Sigma',
  'Root Cause Analysis', 'Failure Analysis',

  // Networking & Security
  'TCP/IP', 'Network Configuration', 'Wireshark',
  'Cybersecurity', 'Encryption', 'Authentication', 'OAuth',

  // AR/VR & Graphics
  'Unity', 'Unreal Engine', 'Three.js', 'WebGL',

  // Productivity & Collaboration
  'Jira', 'Confluence', 'Notion', 'Trello', 'Slack', 'Microsoft Teams',
];

export const SKILL_SUGGESTIONS = [
  // Engineering disciplines
  'Mechanical Engineering', 'Electrical Engineering', 'Civil Engineering',
  'Chemical Engineering', 'Aerospace Engineering', 'Biomedical Engineering',
  'Systems Engineering', 'Software Engineering', 'Computer Engineering',
  'Materials Science', 'Nuclear Engineering', 'Industrial Engineering',

  // Research skills
  'Literature Review', 'Experimental Design', 'Data Collection',
  'Statistical Analysis', 'Technical Writing', 'Research Methodology',
  'Grant Writing', 'Peer Review', 'Lab Management', 'Protocol Development',

  // Design & manufacturing
  'CAD Design', 'Finite Element Analysis', 'CFD Simulation',
  'Rapid Prototyping', 'Product Design', 'Thermal Analysis',
  'Structural Analysis', 'Tolerance Analysis', 'Design for Manufacturing',

  // Soft skills
  'Project Management', 'Team Leadership', 'Public Speaking',
  'Technical Presentations', 'Cross-functional Collaboration',
  'Problem Solving', 'Critical Thinking', 'Mentoring',

  // Domain knowledge
  'Machine Learning', 'Computer Vision', 'Control Systems',
  'Signal Processing', 'Embedded Systems', 'PCB Design',
  'Robotics', 'Automation', 'IoT', 'Power Electronics',
  'Thermodynamics', 'Fluid Mechanics', 'Heat Transfer',
  'Solid Mechanics', 'Dynamics', 'Vibrations',

  // Programming languages
  'Python', 'Java', 'C', 'C++', 'C#', 'JavaScript', 'TypeScript',
  'MATLAB', 'R', 'Go', 'Rust', 'Swift', 'Kotlin',
  'SQL', 'HTML', 'CSS', 'Bash/Shell Scripting',

  // Frameworks & libraries
  'React', 'Next.js', 'Node.js', 'Express.js',
  'Django', 'Flask', 'Spring Boot',
  'TensorFlow', 'PyTorch', 'Scikit-learn',
  'OpenCV', 'NumPy', 'Pandas',

  // Engineering & technical software
  'SolidWorks', 'AutoCAD', 'Fusion 360', 'CATIA',
  'ANSYS', 'COMSOL Multiphysics', 'Abaqus',
  'MATLAB Simulink', 'LTspice', 'Altium Designer',
  'KiCad', 'Proteus', 'LabVIEW',

  // Development tools
  'Git', 'GitHub', 'GitLab',
  'Docker', 'Kubernetes',
  'CI/CD', 'Jenkins', 'GitHub Actions',
  'Linux', 'Unix',

  // Data & cloud
  'Data Analysis', 'Data Visualization',
  'Big Data', 'Hadoop', 'Spark',
  'AWS', 'Azure', 'Google Cloud Platform',
  'REST APIs', 'GraphQL',

  // Hardware & embedded
  'Arduino', 'Raspberry Pi',
  'Microcontrollers', 'FPGA',
  'VHDL', 'Verilog',

  // Testing & methodologies
  'Unit Testing', 'Integration Testing',
  'Agile', 'Scrum', 'Kanban',
  'Version Control', 'Debugging',

  // Cybersecurity & networking
  'Cybersecurity', 'Network Protocols',
  'Encryption', 'Penetration Testing',
];

// ── COMPONENT ─────────────────────────────────────────────────────────────────
export default function TagInput({
  values = [],           // current tags array
  onChange,              // (newValues: string[]) => void
  suggestions = [],      // full list of suggestions
  placeholder = 'Type and press Enter...',
  label,
  maxVisible = 8,        // max suggestions shown at once
}) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Filter suggestions: match input, exclude already-selected
  const filtered = input.trim()
    ? suggestions.filter(s =>
        s.toLowerCase().includes(input.toLowerCase()) &&
        !values.includes(s)
      ).slice(0, maxVisible)
    : suggestions.filter(s => !values.includes(s)).slice(0, maxVisible);

  useEffect(() => { setHighlighted(0); }, [input]);

  // Close on outside click
  useEffect(() => {
    const h = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const addTag = (val) => {
    const tag = val.trim().replace(/,$/, '');
    if (!tag || values.includes(tag)) return;
    onChange([...values, tag]);
    setInput('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag) => onChange(values.filter(v => v !== tag));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (open && filtered[highlighted]) {
        addTag(filtered[highlighted]);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !input && values.length > 0) {
      removeTag(values[values.length - 1]);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Selected tags + input */}
      <div
        className="form-input flex flex-wrap gap-1.5 min-h-[42px] cursor-text p-2"
        onClick={() => { inputRef.current?.focus(); setOpen(true); }}
      >
        {values.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800 rounded-full text-xs font-mono">
            {tag}
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); removeTag(tag); }}
              className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 leading-none ml-0.5"
            >x</button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={values.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[140px] bg-transparent border-none outline-none text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400"
        />
      </div>

      {/* Suggestions dropdown */}
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 pt-2 pb-1 text-[11px] font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
            {input.trim() ? `Suggestions for "${input}"` : 'Popular options'}. You can also type your own and press Enter.
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {filtered.map((s, i) => (
              <button
                key={s}
                type="button"
                onMouseDown={e => { e.preventDefault(); addTag(s); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                  i === highlighted
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <span className="text-gray-300 dark:text-gray-600 text-xs">+</span>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
        Select from the list or type anything and press <kbd className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1 font-mono text-[10px]">Enter</kbd>. Use <kbd className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-1 font-mono text-[10px]">Backspace</kbd> to remove the last tag.
      </p>
    </div>
  );
}
