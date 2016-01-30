Accounts LDAP - Changelog
=========================

### v1.0 (Does not exist yet -- will be in the distant future)

- Automated test suite
- LDAPS support
- Configurable enough to support most LDAP authentication scenarios

### vNext

- TLS support ?

### v0.5.0

- Makes the search filter more flexible without having to overwrite the `LDAP.filter` function

### v0.4.3

- Changed the way that binds are done (using `userPrincipalName` format instead of the email address passed from the client) -- this may mess things up for some people -- I'll accept a PR that makes this part of the process more configurable (I admit that this package caters to the particular ldap setup that I work with.)

### v0.4.2

- Was working fine for quite a while