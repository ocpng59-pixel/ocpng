export const LEADERSHIP_STATUSES = [
  'triggered','initial_assessment','preliminary_investigation','restricted_case','investigation_plan','evidence_review',
  'right_to_be_heard','counsel_quality_review','commission_consideration','no_further_action','administrative_outcome',
  'public_prosecutor_referral','tribunal_tracking','final_outcome','closed',
] as const;
export type LeadershipStatus = (typeof LEADERSHIP_STATUSES)[number];

const leadershipTransitions: Record<LeadershipStatus, LeadershipStatus[]> = {
  triggered: ['initial_assessment'],
  initial_assessment: ['preliminary_investigation','no_further_action'],
  preliminary_investigation: ['restricted_case','no_further_action'],
  restricted_case: ['investigation_plan'],
  investigation_plan: ['evidence_review'],
  evidence_review: ['right_to_be_heard'],
  right_to_be_heard: ['counsel_quality_review'],
  counsel_quality_review: ['commission_consideration'],
  commission_consideration: ['no_further_action','administrative_outcome','public_prosecutor_referral'],
  no_further_action: ['closed'],
  administrative_outcome: ['closed'],
  public_prosecutor_referral: ['tribunal_tracking','closed'],
  tribunal_tracking: ['final_outcome'],
  final_outcome: ['closed'],
  closed: [],
};

export function canTransitionLeadership(from: LeadershipStatus, to: LeadershipStatus): boolean {
  return leadershipTransitions[from].includes(to);
}

export const ANNUAL_STATEMENT_STATUSES = [
  'period_open','issued','reminder_sent','submitted','late','not_submitted','validated','comparative_review','variance_flagged',
  'explanation_requested','explanation_received','compliance_outcome','commission_submission','investigation_authorised','closed',
] as const;
export type AnnualStatementStatus = (typeof ANNUAL_STATEMENT_STATUSES)[number];

const statementTransitions: Record<AnnualStatementStatus, AnnualStatementStatus[]> = {
  period_open: ['issued'],
  issued: ['reminder_sent','submitted','late','not_submitted'],
  reminder_sent: ['submitted','late','not_submitted'],
  submitted: ['validated'],
  late: ['submitted','not_submitted'],
  not_submitted: ['compliance_outcome'],
  validated: ['comparative_review'],
  comparative_review: ['variance_flagged','compliance_outcome'],
  variance_flagged: ['explanation_requested','compliance_outcome'],
  explanation_requested: ['explanation_received'],
  explanation_received: ['compliance_outcome'],
  compliance_outcome: ['commission_submission','investigation_authorised','closed'],
  commission_submission: ['investigation_authorised','closed'],
  investigation_authorised: ['closed'],
  closed: [],
};

export function canTransitionAnnualStatement(from: AnnualStatementStatus, to: AnnualStatementStatus): boolean {
  return statementTransitions[from].includes(to);
}

export const VARIANCE_FLAG_IS_FINDING = false as const;
