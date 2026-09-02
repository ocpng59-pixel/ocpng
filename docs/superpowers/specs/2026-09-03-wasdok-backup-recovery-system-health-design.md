# WASDOK 360 Backup, Recovery & System Health Administration Design

This implementation branch executes the user-approved architecture recorded in Jira WASDOK-55/WASDOK-85: provider-managed database recovery/PITR where available, independent encrypted OCPNG archival backup, separate Storage-object recovery, server-only operations workers, least-privilege backup permissions, verified archive lifecycle, controlled download, isolated restore rehearsal, requester/authorizer separation for production restore, and operational health integration.

For WASDOK-55, a backup is not considered FULL/COMPREHENSIVE unless application database, identity/Auth recovery, and Storage-object recovery are all verified or tied to one tested recovery set. Provider credentials, database passwords, service-role keys, S3 credentials and archive encryption keys never enter browser code, archive manifests or ordinary audit metadata.

Production deployment remains separately gated.