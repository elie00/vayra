/**
 * What pressing Enter in the sign-in dialog should do.
 *
 * The 6-digit code field sits inside the same form as the email field, so Enter
 * used to submit the form and send a *new* magic link — which invalidates the
 * code the person had just typed. Anyone reaching for Enter, which the numeric
 * keyboard's "done" key invites, landed in a loop: new mail, dead code, retry.
 */
export function authSubmitAction(sent: boolean, otp: string): "verify" | "send" {
  const digits = otp.replace(/\D/g, "");
  return sent && digits.length === 6 ? "verify" : "send";
}
