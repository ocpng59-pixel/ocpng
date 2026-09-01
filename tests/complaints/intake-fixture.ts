export const validIntake = {
  complainantName: 'DEMO Complainant',
  email: 'demo-complainant@example.invalid',
  phone: '',
  postalAddress: '',
  governmentBody: 'DEMO Public Body',
  respondent: '',
  subject: 'DEMO delayed response',
  allegation: 'DEMO fictional complaint: a request has not received a response.',
};

export function intakeFormData(values: Record<string, string> = validIntake) {
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}
