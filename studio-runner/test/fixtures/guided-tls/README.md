These are deliberately public, self-signed fixture credentials for loopback mTLS tests only.
They confer no access to any deployed service. Production uses externally mounted issuer and
service credentials; it never reads this directory. The `.fixture` extension allows the public
fixture material to be reviewed and committed without changing the repository's PEM secret ignore.
