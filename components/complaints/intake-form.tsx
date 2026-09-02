'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  checkComplaintIntakeForm,
  INTAKE_FIELDS,
  type IntakeCheckResult,
  type IntakeField,
} from '@/lib/complaints/intake-schema';
import {
  ASSISTED_PRIVACY_NOT_REQUIRED_REASONS,
  OCPNG_COMPLAINT_PRIVACY_NOTICE,
  OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION,
  parseComplaintIntakePrivacy,
} from '@/lib/complaints/intake-privacy';
import type { IntakeSubmissionResult } from '@/lib/complaints/intake-submission';

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function ComplaintIntakeForm({ mode, checkAction, submitAction }: {
  mode: 'public' | 'assisted';
  checkAction: (form: FormData) => Promise<IntakeCheckResult>;
  submitAction: (form: FormData, idempotencyKey: string) => Promise<IntakeSubmissionResult>;
}) {
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const [checkResult, setCheckResult] = useState<IntakeCheckResult | null>(null);
  const [submissionResult, setSubmissionResult] = useState<IntakeSubmissionResult | null>(null);
  const [busy, setBusy] = useState<'check' | 'submit' | null>(null);
  const pending = useRef<'check' | 'submit' | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const summary = useRef<HTMLDivElement>(null);

  const submitted = submissionResult?.status === 'submitted';
  const validationComplete = checkResult?.status === 'valid';
  const errorResult = submissionResult && submissionResult.status !== 'submitted'
    ? submissionResult
    : checkResult && checkResult.status !== 'valid'
      ? checkResult
      : null;

  useEffect(() => {
    if (errorResult) summary.current?.focus();
  }, [errorResult]);

  async function checkDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || pending.current || submitted) return;

    const form = new FormData(event.currentTarget);
    const localResult = checkComplaintIntakeForm(form);
    setSubmissionResult(null);
    idempotencyKey.current = null;

    if (localResult.status !== 'valid') {
      setCheckResult(localResult);
      return;
    }

    pending.current = 'check';
    setBusy('check');
    setCheckResult(null);
    try {
      setCheckResult(await checkAction(form));
    } catch {
      setCheckResult({
        status: 'unavailable',
        fieldErrors: {},
        formError: 'Unable to check the details right now. Your entries are still here. Please try again.',
      });
    } finally {
      pending.current = null;
      setBusy(null);
    }
  }

  async function submitComplaint() {
    if (!hydrated || pending.current || submitted || !validationComplete || !formRef.current) return;

    const form = new FormData(formRef.current);
    const privacy = parseComplaintIntakePrivacy(mode, form);
    if (!privacy.ok) {
      setSubmissionResult({ status: 'invalid', fieldErrors: {}, formError: privacy.message });
      return;
    }

    if (!idempotencyKey.current) idempotencyKey.current = crypto.randomUUID();

    pending.current = 'submit';
    setBusy('submit');
    setSubmissionResult(null);
    try {
      setSubmissionResult(await submitAction(form, idempotencyKey.current));
    } catch {
      setSubmissionResult({
        status: 'unavailable',
        fieldErrors: {},
        formError: 'Unable to submit the complaint right now. Your entries are still here. Please try again.',
      });
    } finally {
      pending.current = null;
      setBusy(null);
    }
  }

  function complaintChanged() {
    if (pending.current || submitted) return;
    setCheckResult(null);
    setSubmissionResult(null);
    idempotencyKey.current = null;
  }

  function privacyChanged() {
    if (pending.current || submitted) return;
    setSubmissionResult(null);
    idempotencyKey.current = null;
  }

  function formInput(event: React.FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (target.name.startsWith('privacy')) return;
    complaintChanged();
  }

  function field(name: IntakeField, hint: string, multiline = false) {
    const definition = INTAKE_FIELDS[name];
    const id = `intake-${name}`;
    const error = errorResult?.fieldErrors[name];
    const attributes = {
      id,
      name,
      required: definition.required,
      maxLength: definition.maxLength,
      'aria-invalid': error ? true as const : undefined,
      'aria-describedby': `${id}-hint${error ? ` ${id}-error` : ''}`,
    };
    return (
      <div className="oc-intake-field">
        <label htmlFor={id}>{definition.label} <span>{definition.required ? '(required)' : '(optional)'}</span></label>
        <p id={`${id}-hint`} className="oc-intake-hint">{hint}</p>
        {multiline
          ? <textarea {...attributes} rows={name === 'allegation' ? 7 : 3} />
          : <input {...attributes} type={name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'text'} />}
        {error ? <p id={`${id}-error`} className="oc-intake-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="oc-intake">
      <header className="oc-page-head">
        <div>
          <p className="oc-intake-eyebrow">{mode === 'public' ? 'Public complaint intake' : 'Assisted complaint intake'}</p>
          <h1>New complaint</h1>
          <p>Provide contact details and describe the matter for the Commission.</p>
        </div>
      </header>

      <div className="oc-notice" id="intake-security-notice">
        <strong>Confidential complaint intake.</strong>
        <p>Provide only information relevant to the complaint. Your information will be handled through WASDOK 360 under the Commission’s privacy and access controls.</p>
      </div>

      <form
        ref={formRef}
        method="post"
        onSubmit={checkDetails}
        onInput={formInput}
        noValidate
        autoComplete="off"
        aria-describedby="intake-security-notice"
      >
        {errorResult ? (
          <div className="oc-intake-summary" role="alert" tabIndex={-1} ref={summary}>
            <h2>Check the details</h2>
            <p>{errorResult.formError}</p>
            {Object.keys(errorResult.fieldErrors).length ? (
              <ul>{(Object.keys(errorResult.fieldErrors) as IntakeField[]).map((name) => (
                <li key={name}><a href={`#intake-${name}`}>{INTAKE_FIELDS[name].label}: {errorResult.fieldErrors[name]}</a></li>
              ))}</ul>
            ) : null}
          </div>
        ) : null}

        <fieldset className="oc-intake-fields" disabled={!hydrated || busy !== null || submitted}>
          <legend className="oc-visually-hidden">Complaint details</legend>
          <section className="oc-card oc-intake-section" aria-labelledby="intake-contact-title">
            <h2 id="intake-contact-title">1. Complainant and contact details</h2>
            <p>Enter the complainant’s name and at least one contact method: email, phone or postal address.</p>
            {field('complainantName', 'Use the name of the person making the complaint. Up to 200 characters.')}
            <div className="oc-intake-grid">
              {field('email', 'Provide an email address if available.')}
              {field('phone', 'Include the country code where needed. Use 7 to 15 digits.')}
            </div>
            {field('postalAddress', 'Provide a postal contact address if available. Up to 1,000 characters.', true)}
          </section>

          <section className="oc-card oc-intake-section" aria-labelledby="intake-matter-title">
            <h2 id="intake-matter-title">2. The matter</h2>
            {field('governmentBody', 'Name the public body or agency concerned. Up to 200 characters.')}
            {field('respondent', 'Name the person or office if known. Leave blank if unknown. Up to 200 characters.')}
            {field('subject', 'Give a brief title for the complaint. Up to 200 characters.')}
            {field('allegation', 'Explain what happened, when and where, and how the complainant was affected. Up to 5,000 characters.', true)}
          </section>
        </fieldset>

        {!validationComplete && !submitted ? (
          <div className="oc-intake-submit">
            <button className="oc-button" type="submit" disabled={!hydrated || busy !== null} aria-busy={busy === 'check'}>
              Check details
            </button>
            <p>Your complaint is not submitted until you review the Privacy Notice and select Submit complaint.</p>
          </div>
        ) : null}

        {validationComplete && !submitted ? (
          <section className="oc-card oc-intake-section" aria-labelledby="privacy-notice-title">
            <h2 id="privacy-notice-title">3. {OCPNG_COMPLAINT_PRIVACY_NOTICE.title}</h2>
            <p className="oc-intake-hint">Notice version: {OCPNG_COMPLAINT_PRIVACY_NOTICE_VERSION}</p>
            {OCPNG_COMPLAINT_PRIVACY_NOTICE.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}

            <fieldset disabled={busy !== null}>
              <legend>{mode === 'public' ? 'Privacy acknowledgement' : 'Privacy acknowledgement record'}</legend>
              <div className="oc-intake-field">
                <label htmlFor="intake-privacy-acknowledged">
                  <input
                    id="intake-privacy-acknowledged"
                    name="privacyAcknowledged"
                    type="checkbox"
                    value="yes"
                    onChange={privacyChanged}
                  />{' '}
                  {mode === 'public'
                    ? OCPNG_COMPLAINT_PRIVACY_NOTICE.publicAcknowledgement
                    : OCPNG_COMPLAINT_PRIVACY_NOTICE.assistedAcknowledgement}
                </label>
              </div>

              {mode === 'assisted' ? (
                <div className="oc-intake-field">
                  <label htmlFor="intake-privacy-not-required">If acknowledgement is not required</label>
                  <p id="intake-privacy-not-required-hint" className="oc-intake-hint">
                    Use this only for an approved intake circumstance. Do not invent a reason.
                  </p>
                  <select
                    id="intake-privacy-not-required"
                    name="privacyNotRequiredReason"
                    defaultValue=""
                    aria-describedby="intake-privacy-not-required-hint"
                    onChange={privacyChanged}
                  >
                    <option value="">Select only when applicable</option>
                    {Object.entries(ASSISTED_PRIVACY_NOT_REQUIRED_REASONS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </fieldset>

            <div className="oc-intake-submit">
              <button className="oc-button" type="button" disabled={busy !== null} onClick={submitComplaint} aria-busy={busy === 'submit'}>
                {busy === 'submit' ? 'Submitting complaint…' : 'Submit complaint'}
              </button>
              <p>Submitting records the complaint and the minimum privacy acknowledgement evidence required for this intake.</p>
            </div>
          </section>
        ) : null}

        <div role="status" aria-live="polite">
          {submitted ? (
            <div className="oc-notice oc-intake-success">
              <strong>Complaint submitted.</strong>
              <p>Receipt reference: <strong>{submissionResult.receiptReference}</strong></p>
              <p>Keep this reference for future communication with the Ombudsman Commission.</p>
              {submissionResult.duplicate ? <p>Your earlier submission was confirmed; no duplicate complaint was created.</p> : null}
            </div>
          ) : validationComplete ? (
            <p className="oc-notice oc-intake-success"><strong>Details checked.</strong> Review the Privacy Notice and complete the acknowledgement before submitting.</p>
          ) : null}
        </div>

        <noscript><p>JavaScript is required to validate and submit this complaint form.</p></noscript>
      </form>
    </div>
  );
}
