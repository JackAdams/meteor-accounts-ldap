Accounts-Ldap
-------------

####Overview

This is a package to implement authentication against an LDAP server and retrieval of user attributes from that server in Meteor. It is an adaptation of `hive:accounts-ldap`.

The things that this package does differently from `hive:accounts-ldap` are:

- UI matches that of the core package `accounts-ui`
- user data (email address, etc.) is stored in the same format as that of the core package `accounts-password`
- users can authenticate using either username or email address
- LDAP settings can be set programatically or using a `settings.json` file
- can peacefully co-exist with the core package `accounts-password`

####Installation

`meteor add babrahams:accounts-ldap`

####Usage

Your server's URL and a DN or DNs to search will need to be set in a settings.json file as `serverUrl` and `serverDn`, respectively. In addition, you can select an array of `whiteListedFields` from an LDAP search to add to the user.profile field in the document created in `Meteor.users` . An example for the settings.json file is:

```
{
  "ldap": {
    "serverDn": "DC=ad,DC=university,DC=edu",
    "serverUrl": "ldap://ad.university.edu:2222",
    "whiteListedFields": [ "displayName", "givenName", "department", "employeeNumber", "mail", "title", "address", "phone", "memberOf"],
    "autopublishFields": [ "displayName", "department", "mail", "title", "address", "phone"]
  }
}
```

**OR**

To create settings programatically, overwrite the function below somewhere in your server code

```
// Overwrite this function to produce settings based on the incoming request
LDAP.generateSettings = function (request) {
  return null;	
}
```

returning an object of the form:

```
{
  "serverDn": "DC=ad,DC=university,DC=edu",
  "serverUrl": "ldap://ad.university.edu:2222",
  "whiteListedFields": [ "displayName", "givenName", "department", "employeeNumber", "mail", "title", "address", "phone", "memberOf"],
  "autopublishFields": [ "displayName", "department", "mail", "title", "address", "phone"]
}
```

You can send info from the client to the server via the request parameter by overwriting the below function **on the client** whose return value will set the value of `request.data`:

```LDAP.data = function () { return null; };```

`{{> ldapLoginButtons}}` renders a template with username/email and password inputs. If login is successful, the user will be added to the `Meteor.users` collection. It is up to the app to publish and subscribe fields. By default, only the username is published.

####Warning

Password is sent from client to server in plain text.  Only use this package in conjunction with SSL.