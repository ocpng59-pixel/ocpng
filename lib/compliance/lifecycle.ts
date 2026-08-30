export const COMPLIANCE_STATUSES = [
  'issued','awaiting_response','response_received','corrective_action','evidence_submitted','review',
  'implemented','partially_implemented','not_implemented','escalated','closed',
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

const transitions: Record<ComplianceStatus, ComplianceStatus[]> = {
  issued: ['awaiting_response'],
  awaiting_response: ['response_received','escalated'],
  response_received: ['corrective_action','review'],
  corrective_action: ['evidence_submitted','escalated'],
  evidence_submitted: ['review'],
  review: ['implemented','partially_implemented','not_implemented'],
  implemented: ['closed'],
  partially_implemented: ['corrective_action','escalated','closed'],
  not_implemented: ['escalated','closed'],
  escalated: ['corrective_action','review','closed'],
  closed: [],
};

export const canTransitionCompliance = (from: ComplianceStatus, to: ComplianceStatus): boolean => transitions[from].includes(to);
