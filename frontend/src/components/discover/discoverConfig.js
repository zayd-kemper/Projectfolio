export const POST_TYPES = [
  { id: 'update', label: 'Update', icon: 'document-edit', helper: 'Progress, milestones, and build notes.' },
  { id: 'feedback_request', label: 'Feedback', icon: 'message', helper: 'Ask for critique on a decision or prototype.' },
  { id: 'question', label: 'Question', icon: 'research-scope', helper: 'Get help from makers with relevant context.' },
  { id: 'launch', label: 'Launch', icon: 'launch-vector', helper: 'Announce a finished project or major release.' },
  { id: 'resource', label: 'Resource', icon: 'link', helper: 'Share a useful article, repo, paper, or tool.' },
  { id: 'open_to_collab', label: 'Collaborate', icon: 'collaboration', helper: 'Find teammates, reviewers, or domain experts.' },
];

export const CONTEXTS = [
  { id: 'show', label: 'Show', icon: 'eye-view' },
  { id: 'ask', label: 'Ask', icon: 'message' },
  { id: 'feedback', label: 'Feedback', icon: 'target' },
  { id: 'launch', label: 'Launch', icon: 'launch-vector' },
  { id: 'resource', label: 'Resource', icon: 'document' },
  { id: 'collab', label: 'Collab', icon: 'team-node' },
  { id: 'hiring', label: 'Hiring', icon: 'briefcase' },
  { id: 'research', label: 'Research', icon: 'research-scope' },
  { id: 'build_log', label: 'Build log', icon: 'code-terminal' },
];

export const FEED_MODES = [
  { id: 'recommended', label: 'For you', icon: 'target' },
  { id: 'latest', label: 'Latest', icon: 'clock' },
  { id: 'trending', label: 'Trending', icon: 'trend-line' },
];

export const normalizeFeedMode = (value) => {
  const mode = String(value || '').toLowerCase();
  if (mode === 'for_you' || mode === 'recommended' || mode === 'personalized') return 'recommended';
  if (mode === 'recent' || mode === 'new' || mode === 'latest') return 'latest';
  if (mode === 'popular' || mode === 'trending') return 'trending';
  return FEED_MODES.some((item) => item.id === mode) ? mode : 'recommended';
};

export const CATEGORY_ICON_BY_TYPE = {
  Research: 'research-scope',
  'Engineering Design': 'settings-gear',
  Software: 'code-terminal',
  Robotics: 'ai-core',
  'Simulation / CFD': 'analytics-gauge',
  'Data Science': 'analytics-gauge',
  Hardware: 'tool-wrench',
  Other: 'project-module',
};

export const typeFor = (id) => POST_TYPES.find((item) => item.id === id) || POST_TYPES[0];
export const contextFor = (id) => CONTEXTS.find((item) => item.id === id) || CONTEXTS[0];

export const cx = (...classes) => classes.filter(Boolean).join(' ');

export const formatCount = (value) => {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}m`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(number);
};

export const buildTree = (comments = []) => {
  const byId = new Map();
  const roots = [];
  comments.forEach((comment) => byId.set(comment.id, { ...comment, replies: [] }));
  byId.forEach((comment) => {
    if (comment.parent_comment_id && byId.has(comment.parent_comment_id)) {
      byId.get(comment.parent_comment_id).replies.push(comment);
    } else {
      roots.push(comment);
    }
  });
  return roots;
};
