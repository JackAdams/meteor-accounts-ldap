Accounts LDAP - Changelog
=========================

### v1.0

- Automated test suite
- LDAPS support
- Configurable enough to support most LDAP systems

### v0.4.3

- Changed the way that binds are done (using `userPrincipalName` format instead of the email address passed from the client) -- this may mess things up for some people -- I'll accept a PR that makes this part of the process more configurable (I admit that this package caters to the particular ldap setup that I work with.)

### v0.4.2

- Was working fine for quite a while