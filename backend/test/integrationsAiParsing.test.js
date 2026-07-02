const test = require('node:test');
const assert = require('node:assert/strict');
const integrationsRouter = require('../routes/integrations');

test('integration JSON parser classifies truncated model output as provider parse failure', () => {
  assert.throws(
    () => integrationsRouter.parseModelJson('```json\n{"summary":"cut off", "top_matches": ['),
    (error) => {
      assert.equal(error.status, 502);
      assert.match(error.message, /cut off|malformed JSON/i);
      return true;
    }
  );
});

test('opportunity finder fallback returns safe catalog matches instead of failing the job', () => {
  const parsed = integrationsRouter.buildOpportunityFinderFallbackParsed(
    {
      name: 'Mike',
      headline: 'Mechanical engineering student',
      skills: ['Java', 'ANSYS', 'mechanical engineering'],
      projects: [
        {
          title: 'Mart',
          description: 'Automation project using Java and engineering analysis.',
          technologies: ['Java', 'ANSYS'],
        },
      ],
      derived: {
        strongest_projects: [{ title: 'Mart' }],
        profile_gaps: ['Project outcomes need more detail.'],
      },
    },
    [
      {
        id: 'robotics-internship',
        name: 'Robotics Internship',
        type: 'internship',
        org: 'Example Lab',
        description: 'Mechanical engineering internship using Java automation and ANSYS simulation.',
        fields: ['mechanical engineering', 'robotics'],
        keywords: ['java', 'ansys'],
        paid: true,
      },
    ],
    new Error('AI response was cut off before valid JSON completed.')
  );

  assert.match(parsed.summary, /fallback ranking/i);
  assert.equal(parsed.top_matches[0].id, 'robotics-internship');
  assert(parsed.top_matches[0].match_score > 60);
  assert(parsed.profile_gaps.includes('Project outcomes need more detail.'));
});
