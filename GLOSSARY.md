# University Alumni Tracking

## Language

**Authentication account**: A person's sign-in identity, credentials, status and assigned roles. An imported profile is not an account.
_Avoid_: alumni row, profile

**Alumni profile**: A graduate's personal, academic, employment and tracking record, whether registered or unregistered.
_Avoid_: user account

**Registered alumnus**: An alumnus with an explicitly linked authentication account. Account activation, contact verification and tracking are separate states.
_Avoid_: verified graduate

**Employment**: A self-reported or staff-maintained job-history entry; one entry at most represents the current job.
_Avoid_: tracking decision

**Evidence**: A private file supporting an alumni record or employment claim. A profile photo is separately identified and is not proof of employment.
_Avoid_: verification

**Tracking decision**: An authorized staff member's recorded tracked/untracked determination with actor, timestamp and optional note. Registration and self-editing do not imply this decision.
_Avoid_: contact verification

**Contact verification**: Proof of control of a particular email address or phone number. Local testing exemptions do not establish this proof.
_Avoid_: MFA, CAPTCHA, profile completion

**Profile completion**: Confirmation of required personal and academic information. It is independent of contact verification and tracking.
