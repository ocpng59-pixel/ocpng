'use client';

import { useEffect, useRef, useState } from 'react';
import {
  checkComplaintIntakeForm, INTAKE_FIELDS,
  type IntakeCheckResult, type IntakeField,
} from '@/lib/complaints/intake-schema';

export function ComplaintIntakeForm({ mode, checkAction }: {
  mode: 'public' | 'assisted';
  checkAction: (form: FormData) => Promise<IntakeCheckResult>;
}) {
  const [result, setResult] = useState<IntakeCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const summary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (result && result.status !== 'valid') summary.current?.focus();
  }, [result]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const form = new FormData(event.currentTarget);
    const localResult = checkComplaintIntakeForm(form);
    if (localResult.status !== 'valid') {
      setResult(localResult);
      return;
    }
    pending.current = true;
    setBusy(true);
    setResult(null);
    try {
      setResult(await checkAction(form));
    } catch {
      setResult({
        status: 'unavailable', fieldErrors: {},
        formError: 'Unable to check the details right now. Your entries are still here. Please try again.',
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function field(name: IntakeField, hint: string, multiline = false) {
    const definition = INTAKE_FIELDS[name];
    const id = `intake-${name}`;
    const error = result?.fieldErrors[name];
    const attributes = {
      id, name, required: definition.required, maxLength: definition.maxLength,
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
          <p className="oc-intake-eyebrow">{mode === 'public' ? 'Public intake preview' : 'Assisted intake preview'}</p>
          <h1>New complaint</h1>
          <p>Provide contact details and describe the matter for the Commission.</p>
        </div>
      </header>
      <div className="oc-notice" id="intake-preview-notice">
        <strong>DEMO preview — use fictional details only.</strong>
        <p>This form checks your details only. It does not submit or save a complaint, and no receipt is issued.
          For a real complaint, use the Commission’s existing intake channels.</p>
      </div>
      <form onSubmit={submit} onInput={() => { if (!pending.current) setResult(null); }} noValidate autoComplete="off" aria-describedby="intake-preview-notice">
        {result && result.status !== 'valid' ? (
          <div className="oc-intake-summary" role="alert" tabIndex={-1} ref={summary}>
            <h2>Check the details</h2>
            <p>{result.formError}</p>
            {Object.keys(result.fieldErrors).length ? (
              <ul>{(Object.keys(result.fieldErrors) as IntakeField[]).map((name) => (
                <li key={name}><a href={`#intake-${name}`}>{INTAKE_FIELDS[name].label}: {result.fieldErrors[name]}</a></li>
              ))}</ul>
            ) : null}
          </div>
        ) : null}
        <fieldset className="oc-intake-fields" disabled={busy}>
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
        <div className="oc-intake-submit">
          <button className="oc-button" type="submit" disabled={busy}>{busy ? 'Checking details…' : 'Check details'}</button>
          <p>Details are not saved. Leaving or refreshing this page will clear your entries.</p>
        </div>
        <div role="status" aria-live="polite">
          {result?.status === 'valid' ? (
            <p className="oc-notice oc-intake-success"><strong>Details checked.</strong> The required details are complete. Your complaint has not been submitted or saved.</p>
          ) : null}
        </div>
        <noscript><p>JavaScript is required to check this preview form. No complaint will be submitted.</p></noscript>
      </form>
    </div>
  );
}
