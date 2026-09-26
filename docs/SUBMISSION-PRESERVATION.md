# Submission preservation while awaiting review

Baseline commit: `ba065458dd6b70dcf168fb4a934cc1919d9317d4`.
This identifies the preserved repository state; it is not a claim about Portal
acceptance or a replacement submission.

Run `npm run check:submission` before committing presentation or frontend fixes.
The guard checks all tracked contracts, raw reports, evidence fixtures, deployment
configuration, payment verification, fee profile, worker deployment configuration,
demo video and submission logo against that commit. Git-normalized content hashes
allow checkout line-ending differences; the deployed contract also has an exact
byte SHA-256 check. Changes, deletions and new non-ignored files in those protected
paths fail the guard.

The baseline must be present locally. CI checks out full history and runs the
guard, the two offline receipt audits, frontend tests and the production build.
It has no deployment step or signing credentials. Do not regenerate evidence,
update the baseline, or rerun live transaction scripts to make a guard failure
pass. Investigate the changed file and wait for the user's direction following
team feedback.

Historical reports remain historical evidence. Documentation clarifications and
read-only frontend recovery do not create a new contract deployment.
