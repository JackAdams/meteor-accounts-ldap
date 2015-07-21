Accounts LDAP
-------------

Authentication against an LDAP server for Meteor.

#### Overview

This is a package to implement authentication against an LDAP server and retrieval of user attributes from that server in Meteor. It is an adaptation of `hive:accounts-ldap`.

The things that this package does differently from `hive:accounts-ldap` are:

- UI matches that of the core package `accounts-ui`
- user data (email address, etc.) is stored in the same format as that of the core package `accounts-password`
- users can authenticate using either username or email address
- LDAP settings can be set programatically or using a `settings.json` file
- package can peacefully co-exist with the core `accounts-password` package
- there are hooks and methods that can be used for multi-tenant apps that store ldap connection info in collections

#### Installation

`meteor add babrahams:accounts-ldap`

#### Usage

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

#### API

##### Client

You can send info from the client to the server via the request parameter by overwriting the below function **on the client** whose return value will set the value of `request.data`:

```
LDAP.data = function () { return null; };
```

The following are only used if you want to create a custom sign-in form:

```
LDAP.customFormTemplate.set("customFormTemplateName");
```

`LDAP.formHelpers` and `LDAP.formEvents` are the helpers and events hashes that the original form uses and are available to custom forms.

A full working implementation of a custom form is here:

[babrahams:accounts-ldap-ionic](https://atmospherejs.com/babrahams/accounts-ldap-ionic) ([github repo](https://github.com/JackAdams/meteor-accounts-ldap-ionic))

##### Server

You can create a custom filter by overwriting the `LDAP.filter` function **on the server** (if the default version, shown below, does not work for your particular LDAP configuration):

```
LDAP.filter = function (email, username) {
  return '(&(' + ((email) ? 'mail' : 'cn') + '=' + username + ')(objectClass=user))';
}
```

You can set

```
LDAP.tryDBFirst = true;
```
**on the server** if you want the package to try and log the user in using the app database before hitting the LDAP server. (This is `false` by default.)

You can set

```
LDAP.logging = false;
```
**on the server** if you want to suppress output to the server console (this is `true` by default, to help with debugging during the initial setup phase)

You can optionally overwrite the following logging function **on the server** to manage logging yourself:

```
LDAP.log: function (message) {
  if (LDAP.logging) {
	console.log(message);
  }
}
```

Overwrite this function **on the server** to modify the condition used to find an existing user:

```
LDAP.modifyCondition = function (condition) {
  return condition;    
}
```
The condition passed to this function is of the form:
```
{emails: {$elemMatch: {address: <emailAddress>}}};
```
if an email address was typed in the login form on the client, or
```
{username: <username>}
```
if a username was typed in the login form on the client.

A similar search condition should be returned by the function. `this` in this function's context is the request object received from the client.

**Note:** if there is a possibility that your Meteor app allows duplicate usernames or email addresses, you could overwrite this function. But, better than this, is to use `LDAP.multitenantIdentifier` as shown below.

To make sure a multi-tenant app doesn't get mixed up with duplicate usernames or passwords, set:

```
LDAP.multitenantIdentifier = 'tenant_id';
```
where `'tenant_id'` is a string that gives the name of a key from `request.data`, as sent from the client using `LDAP.data` (see above). The value associated with this key must be a unique id value for the tenant.

**Note:** if you use `LDAP.multitenantIdentifier`, then `LDAP.modifyCondition` will have no effect, as the package will create the identifier for you. Also, a new field `ldapIdentifier` will be added to each document added to the `users` (`Meteor.users`) collection by this package.

Full example:
_Client_
```
LDAP.data = function () {
  return {
    tenant_id: Session.get('tenant_id')
  };
};
```
_Server_
```
LDAP.multitenantIdentifier = 'tenant_id';
```

Overwrite this function **on the server** to add custom fields to the new user document created when a user from the LDAP directory isn't found in the Meteor app's database (based on the condition above):

```
LDAP.addFields = function (person) {
  // `this` is the request from the client
  // `person` is the object returned from the LDAP server
  // return the fields that are to be added when creating a user as an object of {key: value} pairs
  return {};	
}
```

#### Built in UI

`{{> ldapLoginButtons}}` renders a template with username/email and password inputs. If login is successful, the user will be added to the `Meteor.users` collection. It is up to the app to publish and subscribe fields. By default, only the username is published.

#### Warning

Password is sent from client to server in plain text.  Only use this package in conjunction with SSL.

#### TODO

- make the sign in form more configurable with options like:
  - `unstyled=true` - to remove all classes
  - `alwaysOpen` - to make the form automatically open
  - `loggedOutLinkTemplate` - to replace the default link that you click to open the form
  - `loggedInLinkTemplate` - to replace the default link that you click to get the dropdown once logged in