import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort() : [];
const sql = files.map((name) => fs.readFileSync(new URL(name, dir), 'utf8')).join('\n');

const required = [
  'profiles','roles','permissions','user_roles','role_permissions','data_scopes','security_compartments','user_compartments',
  'divisions','units','teams','positions','officer_assignments','people','leaders','leader_positions','government_bodies','government_body_contacts','liaison_officers',
  'complaints','complaint_parties','complaint_documents','screening_assessments','screening_decisions','cases','case_assignments','case_parties','case_events','case_tasks','case_extensions',
  'allegations','investigations','investigation_plans','investigation_plan_steps','evidence_items','evidence_custody_events','interviews','interview_participants','statutory_notices','information_requests','responses','findings','right_to_be_heard_notices','right_to_be_heard_responses','closure_decisions',
  'annual_statement_periods','annual_statements','annual_statement_reminders','annual_statement_breach_notices','assets','liabilities','income_sources','business_interests','directorships','shareholdings','gifts','financial_transactions','declaration_variances','explanation_requests','explanation_responses',
  'recommendations','recommendation_recipients','agency_responses','compliance_actions','compliance_evidence','compliance_reviews','escalations',
  'moc_meetings','moc_agenda_items','moc_submissions','moc_decisions','moc_actions','delegations','legal_matters','constitutional_references','litigation_events','legislative_reviews','public_prosecutor_referrals','tribunal_matters',
  'monitoring_programs','monitoring_activities','inspections','inspection_findings','service_delivery_indicators','systemic_issues','intelligence_reports','intelligence_sources','intelligence_entities','intelligence_links',
  'documents','document_versions','notifications','workflow_tasks','audit_events','export_events','system_settings'
];

assert.ok(files.length >= 5, 'expected at least five migration files');
for (const table of required) {
  assert.match(sql, new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`, 'i'), `missing table ${table}`);
  assert.match(sql, new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'), `RLS not enabled for ${table}`);
}
for (const helper of ['has_permission','has_compartment','can_access_case']) {
  assert.match(sql, new RegExp(`function\\s+public\\.${helper}\\s*\\(`, 'i'), `missing helper ${helper}`);
}
assert.match(sql, /audit_events[\s\S]*append-only/i, 'audit append-only guard missing');
const seed = fs.readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
assert.match(seed, /DEMO/i, 'seed data must be visibly fictional');
assert.doesNotMatch(seed, /eyJ[A-Za-z0-9_-]{20,}/, 'seed contains JWT-like credential');
console.log(`WASDOK 360 schema smoke checks: PASS (${required.length} required tables)`);
