---
id: auth-password-controls
type: submodule-design
title: Authentication Password Controls
status: draft
---

# Authentication Password Controls

## Responsibility and Boundary

Password controls let users deliberately inspect typed values and prevent registration typos. They are browser presentation controls, not authentication or password-policy enforcement. The server remains authoritative for password policy and account creation; confirmation does not change the API contract.

The reusable input owns only visibility. Callers retain ownership of the value, autocomplete, validation, disabled state and labeling. Visibility changes neither normalize nor modify the value, submit the form, or transmit anything.

## Visibility

Login and sign-up passwords start masked. Each field has an independently operable, keyboard-accessible Show/Hide button with a pressed state. A button is never a submit action. Returning to the password step or switching login/sign-up modes remounts the controls in their masked state; changing modes also clears confirmation.

## Registration Confirmation

The second registration step requires Confirm Password. Both values must match exactly before Create Account is enabled, and the submit handler checks equality independently of the button state. Mismatch feedback appears after confirmation loses focus or a mismatched submission is attempted, then updates as values change. Back preserves the entered values within the sign-up flow.

Confirmation exists only to prevent typing mistakes. It is never added to the signup request, logs or persistent storage. Existing password rules and CAPTCHA gates remain unchanged. Login retains current-password autocomplete; both registration fields use new-password.

Password and confirmation share a row where space allows and stack on phones. Policy guidance remains full width, and small viewports retain normal scrolling rather than clipped fields.
