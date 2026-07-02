// frontend/src/components/shared/OnboardingModal.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import EngineeringIcon from './EngineeringIcon';

const MODES = [
  {
    id: 'engineer',
    icon: 'settings-gear',
    label: 'Engineer',
    tagline: 'Technical projects and systems',
    desc: 'Robotics, software, hardware, CAD, simulations, embedded systems',
    color: '#2563eb',
    defaults: {
      layout: 'classic',
      theme: 'clean',
      accent_color: '#2563eb',
      show_project_type: true,
      show_dates: true,
    },
    features: [
      { icon: 'attachment', text: 'Upload CAD files, code, and technical docs' },
      { icon: 'code-terminal', text: 'Code blocks with syntax highlighting' },
      { icon: 'project-module', text: 'Classic grid layout for fast reviewer scanning' },
      { icon: 'link', text: 'Link GitHub repos and live demos' },
    ],
  },
  {
    id: 'designer',
    icon: 'gallery-grid',
    label: 'Designer',
    tagline: 'Visual work and creative portfolios',
    desc: 'UX/UI, graphic design, product design, illustration, motion',
    color: '#db2777',
    defaults: {
      layout: 'magazine',
      theme: 'minimal',
      accent_color: '#db2777',
      show_project_type: false,
      show_dates: false,
    },
    features: [
      { icon: 'media-frame', text: 'Large cover images for visual-first presentation' },
      { icon: 'document', text: 'Magazine layout with one hero project up front' },
      { icon: 'gallery-grid', text: 'Custom accent colors for brand identity' },
      { icon: 'idea-spark', text: 'Minimal theme that lets the work breathe' },
    ],
  },
  {
    id: 'researcher',
    icon: 'research-scope',
    label: 'Researcher',
    tagline: 'Academic and scientific work',
    desc: 'Lab research, publications, internship applications, STEM',
    color: '#059669',
    defaults: {
      layout: 'fullwidth',
      theme: 'clean',
      accent_color: '#059669',
      show_project_type: true,
      show_dates: true,
    },
    features: [
      { icon: 'document', text: 'Upload papers, reports, and data files' },
      { icon: 'team-node', text: 'Collaborator credits for group research' },
      { icon: 'education', text: 'Optimized for internship applications' },
      { icon: 'analytics-gauge', text: 'Full-width layout for detailed evidence' },
    ],
  },
];

const GOALS = [
  { id: 'internship', icon: 'target', label: 'Land an internship' },
  { id: 'job', icon: 'briefcase', label: 'Get a full-time job' },
  { id: 'research', icon: 'research-scope', label: 'Apply for research programs' },
  { id: 'freelance', icon: 'launch-vector', label: 'Find freelance clients' },
  { id: 'showcase', icon: 'idea-spark', label: 'Showcase my work' },
];

export default function OnboardingModal({ onComplete }) {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedMode, setSelectedMode] = useState(null);
  const [selectedGoals, setSelectedGoals] = useState([]);
  const [saving, setSaving] = useState(false);

  const mode = MODES.find((m) => m.id === selectedMode);
  const progress = `${((step + 1) / 3) * 100}%`;

  const toggleGoal = (id) => {
    setSelectedGoals((goals) => goals.includes(id) ? goals.filter((goal) => goal !== id) : [...goals, id]);
  };

  const handleFinish = async () => {
    if (!selectedMode || !mode) return;
    setSaving(true);
    try {
      await api.put('/auth/profile', { identity_mode: selectedMode });
      await api.put('/settings', {
        ...mode.defaults,
        show_contact_form: true,
        is_public: true,
        section_order: ['header', 'projects', 'contact'],
      });

      localStorage.setItem(`onboarding_done_${user.id}`, '1');
      updateUser({ identity_mode: selectedMode });
      toast.success(`${mode.label} mode applied. Your portfolio defaults are set.`);
      onComplete();
    } catch {
      toast.error('Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    localStorage.setItem(`onboarding_done_${user.id}`, '1');
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-up">
        <div className="px-8 pt-8 pb-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Step {step + 1} of 3
            </span>
            <button onClick={handleSkip} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
              Skip setup
            </button>
          </div>
          <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1 mt-2 mb-6">
            <div
              className="h-1 rounded-full transition-all duration-300"
              style={{ width: progress, backgroundColor: mode?.color || '#2563eb' }}
            />
          </div>
        </div>

        {step === 0 && (
          <div className="px-8 pb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
              What best describes you?
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              ProjectFolio will tune your layout defaults and visibility settings to fit your field.
            </p>

            <div className="space-y-3">
              {MODES.map((item) => {
                const active = selectedMode === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedMode(item.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      active
                        ? 'shadow-sm'
                        : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                    style={active ? { borderColor: item.color, backgroundColor: `${item.color}08` } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <EngineeringIcon name={item.icon} size="1.75rem" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{item.label}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{item.desc}</div>
                      </div>
                      {active && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: item.color }}>
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                            <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setStep(1)}
              disabled={!selectedMode}
              className="mt-6 w-full py-3 rounded-lg font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: mode?.color || '#2563eb' }}
            >
              Continue
            </button>
          </div>
        )}

        {step === 1 && mode && (
          <div className="px-8 pb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-1">
              What is your main goal?
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
              Select all that apply. The app will emphasize the most relevant portfolio sections.
            </p>

            <div className="space-y-2">
              {GOALS.map((goal) => {
                const active = selectedGoals.includes(goal.id);
                return (
                  <button
                    key={goal.id}
                    onClick={() => toggleGoal(goal.id)}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-all flex items-center gap-3 ${
                      active ? '' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300'
                    }`}
                    style={active ? { borderColor: mode.color, backgroundColor: `${mode.color}08`, color: mode.color } : {}}
                  >
                    <EngineeringIcon name={goal.icon} size="1rem" />
                    <span>{goal.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(0)} className="btn-secondary flex-shrink-0">Back</button>
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3 rounded-lg font-semibold text-white transition-opacity"
                style={{ backgroundColor: mode.color }}
              >
                {selectedGoals.length > 0 ? 'See recommendations' : 'Skip goals'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && mode && (
          <div className="px-8 pb-8">
            <div className="flex items-center gap-3 mb-4">
              <EngineeringIcon name={mode.icon} size="2.5rem" />
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  {mode.label} mode
                </h2>
                <p className="text-gray-500 dark:text-gray-400 text-sm">{mode.tagline}</p>
              </div>
            </div>

            <div className="rounded-xl p-4 mb-5" style={{ backgroundColor: `${mode.color}10` }}>
              <p className="text-xs font-semibold mb-3" style={{ color: mode.color }}>
                Portfolio defaults
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                <div>Layout: <span className="font-medium capitalize">{mode.defaults.layout}</span></div>
                <div>Theme: <span className="font-medium capitalize">{mode.defaults.theme}</span></div>
                <div>Show dates: <span className="font-medium">{mode.defaults.show_dates ? 'Yes' : 'Hidden'}</span></div>
                <div>Show type: <span className="font-medium">{mode.defaults.show_project_type ? 'Yes' : 'Hidden'}</span></div>
              </div>
            </div>

            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">
              Key features for {mode.label.toLowerCase()}s
            </p>
            <div className="space-y-2.5 mb-6">
              {mode.features.map((feature) => (
                <div key={feature.text} className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <EngineeringIcon name={feature.icon} size="1rem" />
                  <span>{feature.text}</span>
                </div>
              ))}
            </div>

            {selectedGoals.includes('research') && (
              <div className="rounded-xl p-3 mb-5 bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-800">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">For research applications</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  Go to Integrations after setup to copy your portfolio URL and use it in applications.
                </p>
              </div>
            )}

            {(selectedGoals.includes('internship') || selectedGoals.includes('job')) && (
              <div className="rounded-xl p-3 mb-5 bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-800">
                <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">For job applications</p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Add your resume URL in Profile settings so it appears as a download button on your public portfolio.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="btn-secondary flex-shrink-0">Back</button>
              <button
                onClick={handleFinish}
                disabled={saving}
                className="flex-1 py-3 rounded-lg font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ backgroundColor: mode.color }}
              >
                {saving ? 'Setting up...' : `Launch in ${mode.label} mode`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
