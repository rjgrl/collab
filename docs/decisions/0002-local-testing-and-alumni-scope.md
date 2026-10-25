# Local testing and Alumni-only scope

Status: accepted by the latest explicit user request, 2026-10-23.

An unenrolled Administrator must be able to test locally. `LOCAL_DISABLE_MFA=true` pauses mandatory Administrator MFA only with `NODE_ENV=development` and the managed, named loopback MongoDB on port 27018 / replica set rs0. Setup supplies this default for local development and the isolated role demo. Set false/unset and restart to restore enforcement. Production and other targets reject the exemption. Factors and recovery codes remain stored, and sessions are not falsely marked verified. Password, account status, session, profile and permission checks remain in force.

Integration configuration, imports, provider actions and Sheets exports require both an Administrator role and effective permissions. Staff cannot gain integration access through legacy or newly assigned permission grants; their authorized CSV reporting remains. UI hiding is backed by the service boundary.

Faculty is outside the Alumni-only scope. Remove the active screen, navigation, client, contracts and HTTP module while preserving historical MongoDB models, records and index metadata. Existing account roles and other data are unchanged.

The top-right account trigger shows a readable role beneath the name. Administrator takes display precedence for mixed roles. The subtitle does not grant permissions or change authentication.

See [implementation and verification](../LOCAL_TESTING_FOLLOW_UP.md).
