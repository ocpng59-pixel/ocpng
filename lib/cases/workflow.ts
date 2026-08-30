export const COMPLAINT_STATUSES = [
  'received','registered','screening','jurisdiction_assessment','accepted','declined','deferred','referred',
  'preliminary_investigation','full_investigation','draft_findings','right_to_be_heard','final_assessment',
  'commission_submission','decision','compliance_monitoring','closed',
] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

const transitions: Record<ComplaintStatus, ComplaintStatus[]> = {
  received: ['registered'],
  registered: ['screening'],
  screening: ['jurisdiction_assessment'],
  jurisdiction_assessment: ['accepted','declined','deferred','referred','closed'],
  accepted: ['preliminary_investigation'],
  declined: ['closed'],
  deferred: ['screening','closed'],
  referred: ['closed'],
  preliminary_investigation: ['full_investigation','draft_findings','closed'],
  full_investigation: ['draft_findings'],
  draft_findings: ['right_to_be_heard'],
  right_to_be_heard: ['final_assessment'],
  final_assessment: ['commission_submission','decision','closed'],
  commission_submission: ['decision'],
  decision: ['compliance_monitoring','closed'],
  compliance_monitoring: ['closed'],
  closed: [],
};

export const availableComplaintTransitions = (status: ComplaintStatus): ComplaintStatus[] => [...transitions[status]];
export const canTransitionComplaint = (from: ComplaintStatus, to: ComplaintStatus): boolean => transitions[from].includes(to);
