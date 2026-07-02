// frontend/src/pages/LandingPage.jsx
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import EngineeringIcon from '../components/shared/EngineeringIcon';

const FEATURES = [
  { icon: 'ai-core', title: 'AI editing agent', desc: 'Describe a portfolio change, review the bundle, then apply or revert it from the same workspace.' },
  { icon: 'blocks', title: 'Block-based editor', desc: 'Build case studies with text, media, code, diagrams, files, metrics, and process notes.' },
  { icon: 'source-network', title: 'Shareable portfolio URL', desc: 'Publish a credible project site and use the same link across applications and profiles.' },
  { icon: 'document', title: 'PDF and data export', desc: 'Export polished materials or structured data when an application needs attachments.' },
  { icon: 'connector', title: 'Platform integration', desc: 'Let external tools request clean portfolio data through the ProjectFolio API.' },
  { icon: 'analytics-gauge', title: 'View analytics', desc: 'See which projects get attention and understand how visitors move through your work.' },
  { icon: 'measurement', title: 'Engineering-first proof', desc: 'Show CAD files, code, version notes, design decisions, collaborators, and measurable results.' },
];

const WORKFLOW = [
  { icon: 'key-access', title: 'Set up identity', desc: 'Choose your public URL, profile details, and default portfolio style.' },
  { icon: 'document-edit', title: 'Document the work', desc: 'Attach media, decisions, files, collaborators, and outcomes to each project.' },
  { icon: 'source-network', title: 'Share with reviewers', desc: 'Publish a URL, export materials, or connect an integration when needed.' },
];

const PREVIEW_NAV_ACTIVE = 'bg-blue-600 text-white';
const PREVIEW_NAV_INACTIVE = 'text-gray-600';

function BrandMark({ dark = false }) {
  return (
    <span className="inline-flex items-center gap-2">
      <EngineeringIcon name="brand-projectfolio" size="1.5rem" />
      <span className={`font-semibold text-xl ${dark ? 'text-white' : 'text-gray-900'}`}>ProjectFolio</span>
    </span>
  );
}

function ProofPreview() {
  return (
    <div className="border border-gray-200 bg-white shadow-sm rounded-xl overflow-hidden">
      <div className="grid lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block border-r border-gray-200 bg-gray-50 p-5">
          <BrandMark />
          <nav className="mt-8 space-y-1 text-sm">
            {[
              ['project-module', 'Projects', true],
              ['media-frame', 'Media'],
              ['analytics-gauge', 'Analytics'],
              ['ai-core', 'AI Agent'],
            ].map(([icon, label, active]) => {
              const itemTone = active ? PREVIEW_NAV_ACTIVE : PREVIEW_NAV_INACTIVE;

              return (
                <div key={label} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${itemTone}`}>
                  <EngineeringIcon name={icon} size="1rem" />
                  <span>{label}</span>
                </div>
              );
            })}
          </nav>
        </aside>

        <div className="p-5 lg:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
            <div>
              <p className="text-sm font-medium text-blue-700">Evidence board</p>
              <h2 className="mt-1 text-2xl font-semibold text-gray-950">Maya Iyer</h2>
              <p className="mt-1 text-sm text-gray-500">Robotics research, CFD, embedded controls</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
              <EngineeringIcon name="signal-success" size="1rem" />
              Published
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.2fr_.8fr]">
            <article className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="aspect-[16/9] rounded-lg border border-blue-100 bg-blue-50 p-4">
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <EngineeringIcon name="launch-vector" size="2.25rem" />
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-medium text-blue-700">Robotics</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs font-medium text-blue-950">
                    {['Flight logs', 'Bench tests', 'Safety notes'].map((label) => (
                      <span key={label} className="rounded-md bg-white/80 px-2 py-1 text-center">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <h3 className="mt-4 font-semibold text-gray-950">Autonomous quadcopter control stack</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Flight controller, telemetry dashboard, safety envelope tests, and field-trial notes in one case study.
              </p>
            </article>

            <div className="space-y-4">
              <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-950">
                  <EngineeringIcon name="ai-core" size="1rem" />
                  Site Agent review
                </div>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  Add a stronger proof section and move process notes above the gallery.
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-medium text-gray-600">
                  {['Plan', 'Preview', 'Apply'].map((label, index) => (
                    <span key={label} className={`rounded-md px-2 py-1 text-center ${index < 2 ? 'bg-blue-100 text-blue-700' : 'bg-white'}`}>
                      {label}
                    </span>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm font-semibold text-gray-950">Portfolio analytics</p>
                <div className="mt-4 flex items-end gap-2 h-24">
                  {[36, 58, 44, 72, 88, 64, 92].map((height, index) => (
                    <div key={index} className="flex-1 rounded-t bg-blue-600" style={{ height: `${height}%`, opacity: 0.45 + index * 0.06 }} />
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-[100dvh] bg-white text-gray-950" style={{ colorScheme: 'light' }}>
      <nav className="flex items-center justify-between px-6 lg:px-12 py-5 border-b border-gray-200">
        <Link to="/" aria-label="ProjectFolio home">
          <BrandMark />
        </Link>
        <div className="flex items-center gap-3">
          {user ? (
            <Link to="/dashboard" className="btn-primary">Go to dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="btn-ghost text-gray-700">Sign in</Link>
              <Link to="/register" className="btn-primary whitespace-nowrap">
                <span className="hidden sm:inline">Get started free</span>
                <span className="sm:hidden">Start free</span>
              </Link>
            </>
          )}
        </div>
      </nav>

      <main>
        <section className="px-6 lg:px-12 pt-16 pb-16">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.82fr_1.18fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
                <EngineeringIcon name="education" size="1rem" />
                Built for engineering and science students
              </span>
              <h1 className="mt-8 text-5xl lg:text-7xl font-semibold leading-tight tracking-normal text-gray-950">
                ProjectFolio
              </h1>
              <p className="mt-5 max-w-xl text-xl leading-8 text-gray-600">
                Build evidence-rich portfolios for technical work: writeups, media, files, collaborators, outcomes, analytics, and reviewable AI edits.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-start gap-3">
                <Link to="/register" className="btn-primary text-base px-8 py-4">
                  Build my portfolio
                </Link>
                <a href="#features" className="btn-secondary text-base px-8 py-4">
                  See features
                </a>
              </div>
            </div>
            <ProofPreview />
          </div>
        </section>

        <section className="px-6 lg:px-12 py-20 border-y border-gray-200 bg-gray-50">
          <div className="mx-auto max-w-6xl grid gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700">
                <EngineeringIcon name="ai-core" size="1rem" />
                AI editing option
              </span>
              <h2 className="mt-6 text-4xl lg:text-5xl font-semibold leading-tight text-gray-950">
                Edit your portfolio by talking to the Site Agent
              </h2>
              <p className="mt-5 text-lg leading-8 text-gray-600">
                Ask for a change, inspect the generated bundle, apply it, and keep a reversible history. The agent uses native sections and settings first, then scoped CSS or sandboxed custom code when needed.
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="grid gap-4 md:grid-cols-[.9fr_1.1fr]">
                <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm font-semibold text-gray-950">Prompt</p>
                  <p className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-950">
                    Make my robotics portfolio feel more credible for research labs and surface the testing evidence earlier.
                  </p>
                  <div className="mt-4 space-y-2">
                    {['Reading current sections', 'Planning layout changes', 'Preparing review bundle'].map((step, index) => (
                      <div key={step} className="flex items-center gap-2 text-sm text-gray-600">
                        <EngineeringIcon name={index < 2 ? 'signal-success' : 'clock'} size="0.95rem" />
                        {step}
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-950">Review bundle</p>
                      <p className="mt-1 text-sm text-gray-500">Hero, proof cards, section order, and scoped styles.</p>
                    </div>
                    <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">Ready</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {['Sections', 'CSS', 'Preview'].map((label) => (
                      <div key={label} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                        <div className="h-2 w-10 rounded-full bg-blue-200" />
                        <p className="mt-3 text-xs font-medium text-gray-700">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <span className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white">Apply</span>
                    <span className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-center text-sm font-semibold text-gray-700">Revert</span>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="px-6 lg:px-12 py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[.78fr_1.22fr]">
            <div>
              <h2 className="text-4xl font-semibold text-gray-950">Everything you need to show real work</h2>
              <p className="mt-4 text-lg leading-8 text-gray-600">
                Built for the way technical projects are judged: by decisions, artifacts, outcomes, and clear communication.
              </p>
            </div>
            <div className="border-y border-gray-200">
              {FEATURES.map((feature) => (
                <article key={feature.title} className="grid gap-3 border-b border-gray-200 py-5 last:border-b-0 sm:grid-cols-[2.5rem_1fr]">
                  <EngineeringIcon name={feature.icon} size="1.75rem" />
                  <div>
                    <h3 className="text-lg font-semibold text-gray-950">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{feature.desc}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 lg:px-12 py-20 border-y border-gray-200 bg-gray-50">
          <div className="mx-auto max-w-6xl grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <div>
              <h2 className="text-4xl font-semibold text-gray-950">Get started in minutes</h2>
              <p className="mt-4 text-lg leading-8 text-gray-600">
                Set the structure once, then keep adding evidence as your work evolves.
              </p>
            </div>
            <div className="grid overflow-hidden rounded-xl border border-gray-200 bg-white md:grid-cols-3">
              {WORKFLOW.map((step) => (
                <article key={step.title} className="border-b border-gray-200 p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
                  <EngineeringIcon name={step.icon} size="1.5rem" />
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{step.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 lg:px-12 py-16">
          <div className="mx-auto max-w-5xl rounded-xl border border-blue-200 bg-blue-50 p-8 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-blue-700">
              <EngineeringIcon name="research-scope" size="1rem" />
              Internship and job applicants
            </span>
            <h2 className="mt-6 text-3xl font-semibold text-gray-950">Applying soon?</h2>
            <p className="mx-auto mt-3 max-w-2xl text-lg leading-8 text-gray-600">
              Share a portfolio URL that proves what you built instead of asking reviewers to infer it from a resume bullet.
            </p>
            <Link to="/register" className="mt-6 inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 transition-colors">
              Start your portfolio
            </Link>
          </div>
        </section>
      </main>

      <footer className="px-6 lg:px-12 py-10 border-t border-gray-200">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 sm:flex-row">
          <BrandMark />
          <p className="text-sm text-gray-500">Built for engineers and scientists who do real work.</p>
        </div>
      </footer>
    </div>
  );
}
