// Deterministic portfolio analyzer for the Advisor. Pure functions, no AI —
// this is both the curated-suggestion engine's input and the fallback when the
// AI analysis call fails.

const DISCIPLINES = [
  { id: 'software', label: 'Software Engineering' },
  { id: 'data-ml', label: 'Data & Machine Learning' },
  { id: 'electrical', label: 'Electrical Engineering' },
  { id: 'mechanical', label: 'Mechanical Engineering' },
  { id: 'robotics', label: 'Robotics & Autonomous Systems' },
  { id: 'bio-chem', label: 'Biological & Chemical Engineering' },
];

const DISCIPLINE_KEYWORDS = {
  software: [
    'javascript', 'typescript', 'react', 'vue', 'angular', 'node', 'express', 'api', 'frontend',
    'backend', 'fullstack', 'full-stack', 'web app', 'website', 'database', 'sql', 'postgres',
    'mongodb', 'docker', 'kubernetes', 'aws', 'cloud', 'mobile app', 'swift', 'kotlin', 'java',
    'golang', 'rust', 'devops', 'microservice', 'software',
  ],
  'data-ml': [
    'machine learning', 'deep learning', 'neural network', 'pytorch', 'tensorflow', 'keras',
    'pandas', 'numpy', 'data science', 'data analysis', 'dataset', 'nlp', 'computer vision',
    'opencv', 'scikit', 'statistics', 'jupyter', 'kaggle', 'llm', 'data pipeline', 'ml',
  ],
  electrical: [
    'circuit', 'pcb', 'embedded', 'microcontroller', 'fpga', 'verilog', 'vhdl', 'signal processing',
    'voltage', 'stm32', 'esp32', 'soldering', 'oscilloscope', 'power electronics', 'analog',
    'kicad', 'altium', 'firmware', 'electrical',
  ],
  mechanical: [
    'cad', 'solidworks', 'fusion 360', 'fea', 'ansys', 'thermodynamics', 'manufacturing',
    '3d printing', 'machining', 'mechanism', 'materials science', 'aerodynamics', 'fluid dynamics',
    'cfd', 'gear', 'chassis', 'mechanical',
  ],
  robotics: [
    'ros', 'ros 2', 'robot', 'slam', 'autonomous', 'drone', 'uav', 'lidar', 'kinematics',
    'control systems', 'pid', 'actuator', 'servo', 'navigation', 'gazebo', 'path planning',
    'localization', 'arduino', 'raspberry pi', 'robotics',
  ],
  'bio-chem': [
    'biology', 'chemistry', 'biotech', 'bioinformatics', 'protein', 'dna', 'crispr', 'assay',
    'chemical', 'synthesis', 'molecular', 'genomics', 'pcr', 'cell culture', 'enzyme',
    'spectroscopy', 'biomedical', 'lab work',
  ],
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const toTokenText = (...parts) => parts
  .map((part) => String(part || '').toLowerCase())
  .filter(Boolean)
  .join(' ');

// Whole-word match so "ml" doesn't fire inside "html" and "cad" not inside "arcade".
const keywordHits = (text, keyword) => {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.match(new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'g'));
  return matches ? matches.length : 0;
};

const scoreDisciplines = (context) => {
  const derived = context.derived || {};
  const profileText = toTokenText(context.headline, context.bio, asArray(context.skills).join(' '));
  const techText = asArray(derived.top_technologies)
    .map((tech) => `${String(tech.name || '').toLowerCase()} `.repeat(Math.max(1, Number(tech.count) || 1)))
    .join(' ');
  const typeText = asArray(derived.project_types)
    .map((type) => `${String(type.name || '').toLowerCase()} `.repeat(Math.max(1, Number(type.count) || 1)))
    .join(' ');
  const projectText = toTokenText(...asArray(context.projects).map((project) =>
    toTokenText(project.title, project.type, asArray(project.technologies).join(' '))));

  const scored = DISCIPLINES.map(({ id, label }) => {
    let score = 0;
    for (const keyword of DISCIPLINE_KEYWORDS[id]) {
      score += keywordHits(profileText, keyword);
      score += keywordHits(techText, keyword) * 2;
      score += keywordHits(typeText, keyword) * 2;
      score += keywordHits(projectText, keyword);
    }
    return { id, label, score };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const total = scored.reduce((sum, entry) => sum + entry.score, 0);
  return scored.map((entry) => ({
    ...entry,
    confidence: total > 0 && entry.score / total >= 0.4 ? 'high'
      : total > 0 && entry.score / total >= 0.2 ? 'medium'
        : 'low',
  }));
};

// Core skills a portfolio in each discipline is expected to demonstrate.
// Matched by keyword against profile skills + derived project technologies.
const DISCIPLINE_EXPECTED_SKILLS = {
  software: [
    { name: 'Version control (Git)', keywords: ['git', 'github'] },
    { name: 'Databases & SQL', keywords: ['sql', 'postgres', 'mysql', 'database', 'mongodb'] },
    { name: 'API design', keywords: ['api', 'rest', 'graphql'] },
    { name: 'Automated testing & CI', keywords: ['jest', 'vitest', 'pytest', 'testing', 'ci/cd'] },
    { name: 'Cloud deployment', keywords: ['aws', 'gcp', 'azure', 'docker', 'kubernetes', 'deploy'] },
  ],
  'data-ml': [
    { name: 'Python data stack (pandas/NumPy)', keywords: ['pandas', 'numpy'] },
    { name: 'ML frameworks (PyTorch/TensorFlow)', keywords: ['pytorch', 'tensorflow', 'keras', 'scikit'] },
    { name: 'Data visualization', keywords: ['matplotlib', 'seaborn', 'plotly', 'tableau', 'd3'] },
    { name: 'Model evaluation & statistics', keywords: ['statistics', 'cross-validation', 'evaluation'] },
    { name: 'SQL & data pipelines', keywords: ['sql', 'etl', 'spark', 'airflow'] },
  ],
  electrical: [
    { name: 'PCB design (KiCad/Altium)', keywords: ['pcb', 'kicad', 'altium', 'eagle'] },
    { name: 'Embedded firmware (C/C++)', keywords: ['firmware', 'embedded', 'stm32', 'esp32', 'avr'] },
    { name: 'Circuit simulation', keywords: ['spice', 'ltspice', 'multisim'] },
    { name: 'Signal processing', keywords: ['dsp', 'signal processing', 'fft'] },
    { name: 'Bench instrumentation', keywords: ['oscilloscope', 'multimeter', 'logic analyzer'] },
  ],
  mechanical: [
    { name: 'Parametric CAD (SolidWorks/Fusion)', keywords: ['solidworks', 'fusion', 'onshape', 'cad'] },
    { name: 'FEA / CFD simulation', keywords: ['fea', 'ansys', 'cfd', 'abaqus'] },
    { name: 'Design for manufacturing', keywords: ['dfm', '3d printing', 'cnc', 'injection molding'] },
    { name: 'Materials selection', keywords: ['materials science', 'material selection'] },
    { name: 'GD&T and technical drawings', keywords: ['gd&t', 'engineering drawing', 'tolerancing'] },
  ],
  'bio-chem': [
    { name: 'Documented wet-lab technique', keywords: ['pcr', 'assay', 'cell culture', 'titration'] },
    { name: 'Bioinformatics tooling', keywords: ['bioinformatics', 'biopython', 'blast', 'genomics'] },
    { name: 'Quantitative analysis (Python/R)', keywords: ['python', 'rstudio', 'statistics'] },
    { name: 'Lab instrumentation', keywords: ['spectroscopy', 'chromatography', 'microscopy'] },
    { name: 'Protocol & safety documentation', keywords: ['protocol', 'sop', 'lab notebook'] },
  ],
  robotics: [
    { name: 'ROS / ROS 2', keywords: ['ros'] },
    { name: 'SLAM & localization', keywords: ['slam', 'localization'] },
    { name: 'Motion planning', keywords: ['motion planning', 'path planning'] },
    { name: 'Control theory (PID, state-space)', keywords: ['pid', 'control theory', 'control systems'] },
    { name: 'Simulation (Gazebo/Isaac)', keywords: ['gazebo', 'isaac', 'webots'] },
    { name: 'Embedded platforms (Arduino/STM32)', keywords: ['arduino', 'stm32', 'raspberry pi'] },
  ],
};

// skill_gaps = discipline-expected skills nobody can see in the portfolio, plus
// profile skills claimed without any project technology backing them.
const buildSkillProfile = (context, primaryDiscipline) => {
  const claimed = asArray(context.skills).map((skill) => String(skill || '').toLowerCase().trim()).filter(Boolean);
  const evidenced = asArray((context.derived || {}).top_technologies)
    .map((tech) => String(tech.name || '').toLowerCase().trim())
    .filter(Boolean);
  const knownText = [...claimed, ...evidenced].join(' ');

  const skillGaps = [];
  for (const expected of DISCIPLINE_EXPECTED_SKILLS[primaryDiscipline] || []) {
    if (!expected.keywords.some((keyword) => knownText.includes(keyword))) {
      skillGaps.push({
        name: expected.name,
        reason: 'Core skill for your discipline that is not yet visible in your portfolio.',
      });
    }
  }
  const isEvidenced = (skill) => evidenced.some((tech) => tech.includes(skill) || skill.includes(tech));
  for (const skill of claimed) {
    if (!isEvidenced(skill)) {
      skillGaps.push({
        name: skill,
        reason: 'Listed in your profile skills but not demonstrated by any project yet.',
      });
    }
  }

  const demonstrated = [...new Set([...evidenced, ...claimed.filter(isEvidenced)])];
  return { skill_gaps: skillGaps, demonstrated_skills: demonstrated };
};

// Level heuristic: points for published volume, written evidence depth, and
// technology breadth. 0-1 beginner, 2-3 intermediate, 4+ advanced.
const estimateLevel = (context) => {
  const derived = context.derived || {};
  const projects = asArray(context.projects);
  const published = Number(derived.published_project_count) || 0;
  const evidenceScores = projects.map((project) => Number(project.evidence_score) || 0);
  const avgEvidence = evidenceScores.length
    ? evidenceScores.reduce((sum, score) => sum + score, 0) / evidenceScores.length
    : 0;
  const techBreadth = asArray(derived.top_technologies).length;

  let points = 0;
  if (published >= 4) points += 2;
  else if (published >= 2) points += 1;
  if (avgEvidence >= 7) points += 2;
  else if (avgEvidence >= 4) points += 1;
  if (techBreadth >= 9) points += 2;
  else if (techBreadth >= 5) points += 1;

  if (points >= 4) return 'advanced';
  if (points >= 2) return 'intermediate';
  return 'beginner';
};

const analyzePortfolio = (context = {}) => {
  const disciplines = scoreDisciplines(context);
  const primaryDiscipline = disciplines[0].score > 0 ? disciplines[0].id : null;
  const derived = context.derived || {};

  // Secondary disciplines with any evidence + project types beyond the primary
  // discipline read as interests worth feeding the suggestion engine.
  const interests = [...new Set([
    ...disciplines.slice(1).filter((entry) => entry.score > 0).slice(0, 3).map((entry) => entry.label),
    ...asArray(derived.project_types)
      .map((type) => String(type.name || '').trim())
      .filter((name) => name && name.toLowerCase() !== primaryDiscipline),
  ])];

  const signals = [];
  const published = Number(derived.published_project_count) || 0;
  const total = Number(derived.project_count) || 0;
  if (total > 0) signals.push(`${published} of ${total} projects are published.`);
  const topTech = asArray(derived.top_technologies).slice(0, 6).map((tech) => tech.name).filter(Boolean);
  if (topTech.length) signals.push(`Most-used technologies: ${topTech.join(', ')}.`);
  const strongest = asArray(derived.strongest_projects)[0];
  if (strongest && strongest.title) signals.push(`Strongest evidence: ${strongest.title}.`);
  for (const gap of asArray(derived.profile_gaps).slice(0, 4)) signals.push(String(gap));

  return {
    disciplines,
    primary_discipline: primaryDiscipline,
    estimated_level: estimateLevel(context),
    ...buildSkillProfile(context, primaryDiscipline),
    interests,
    signals,
  };
};

module.exports = { analyzePortfolio, DISCIPLINES, DISCIPLINE_KEYWORDS };
