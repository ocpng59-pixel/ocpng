import { describe, expect, it } from 'vitest';
import { parseComplaintIntake, checkComplaintIntakeForm } from '@/lib/complaints/intake-schema';
import { intakeFormData, validIntake } from './intake-fixture';

describe('complaint intake field rules', () => {
  it('accepts the minimum named complaint without an individual respondent', () => {
    expect(parseComplaintIntake(validIntake)).toEqual({ success: true, data: validIntake });
  });

  it('trims surrounding whitespace while retaining the allegation text', () => {
    expect(parseComplaintIntake({ ...validIntake, complainantName: '  DEMO Complainant  ', allegation: '  DEMO line one\nline two  ' }))
      .toEqual({ success: true, data: { ...validIntake, allegation: 'DEMO line one\nline two' } });
  });

  it.each(['complainantName', 'governmentBody', 'subject', 'allegation'] as const)
    ('rejects blank %s with an actionable field error', (field) => {
      const result = parseComplaintIntake({ ...validIntake, [field]: ' \n ' });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.fieldErrors[field]).toMatch(/enter/i);
    });

  it.each([
    ['phone', '+675 7000 0000'],
    ['postalAddress', 'DEMO postal address'],
  ])('accepts %s as the only contact method', (field, value) => {
    expect(parseComplaintIntake({ ...validIntake, email: '', [field]: value }).success).toBe(true);
  });

  it('requires a way to contact the named complainant', () => {
    const result = parseComplaintIntake({ ...validIntake, email: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.fieldErrors.email).toMatch(/email.*phone.*postal/i);
  });

  it.each([['email', 'DEMO-invalid'], ['phone', 'DEMO-call-me'], ['phone', '123']])
    ('rejects an invalid supplied %s even when another contact method is valid', (field, value) => {
      expect(parseComplaintIntake({ ...validIntake, [field]: value }).success).toBe(false);
    });

  it.each([
    ['complainantName', 200], ['email', 254], ['phone', 40], ['postalAddress', 1000],
    ['governmentBody', 200], ['respondent', 200], ['subject', 200], ['allegation', 5000],
  ])('rejects %s beyond its maximum length', (field, max) => {
    const result = parseComplaintIntake({ ...validIntake, [field]: 'x'.repeat(Number(max) + 1) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.fieldErrors[field as keyof typeof validIntake]).toBeTruthy();
  });

  it('accepts the allegation at the length boundary', () => {
    expect(parseComplaintIntake({ ...validIntake, allegation: 'x'.repeat(5000) }).success).toBe(true);
  });

  it.each([null, [], 'DEMO', { ...validIntake, complainantName: 42 }, { ...validIntake, subject: {} }])
    ('rejects malformed payloads without throwing or exposing schema internals', (input) => {
      const result = parseComplaintIntake(input);
      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/Zod|expected|invalid_type|stack/i);
    });

  it('rejects forged ownership/state/classification without echoing attacker keys', () => {
    const result = parseComplaintIntake({ ...validIntake, 'DEMO-private-injected-key': 'DEMO', actorId: 'DEMO', status: 'submitted', classification: 'PUBLIC' });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/DEMO-private|actorId|submitted|PUBLIC/);
  });

  it('server form validation returns no entered values on success', () => {
    expect(checkComplaintIntakeForm(intakeFormData())).toEqual({ status: 'valid', fieldErrors: {} });
  });

  it('rejects repeated form fields instead of silently choosing one', () => {
    const form = intakeFormData();
    form.append('subject', 'DEMO duplicate');
    expect(checkComplaintIntakeForm(form).status).toBe('invalid');
  });

  it('rejects uploaded files in text fields', () => {
    const form = intakeFormData();
    form.set('allegation', new Blob(['DEMO']), 'demo.txt');
    expect(checkComplaintIntakeForm(form).status).toBe('invalid');
  });

  it('does not echo entered information in error results', () => {
    const result = checkComplaintIntakeForm(intakeFormData({ ...validIntake, email: 'DEMO-sensitive-invalid-email' }));
    expect(result.status).toBe('invalid');
    expect(JSON.stringify(result)).not.toMatch(/DEMO/);
  });
});
