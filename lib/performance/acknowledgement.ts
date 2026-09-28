/**
 * Staff Performance Management — acknowledgement wording (mission brief §9).
 *
 * Acknowledgement means the employee has received and reviewed the
 * notice. It must NEVER say or imply agreement with the warning. This
 * exact string is what is stored on StaffPerformanceDocument.acknowledgementText
 * and is the ONLY text the acknowledge endpoint will ever write there —
 * it is not accepted as free-form input from the client.
 */
export const ACKNOWLEDGEMENT_TEXT =
  'I acknowledge that I have received and reviewed this notice.'

/** Never present in acknowledgement copy — a guard used in tests/UI. */
export const FORBIDDEN_AGREEMENT_PHRASES = ['I agree', 'agree with this warning', 'I accept the warning']
