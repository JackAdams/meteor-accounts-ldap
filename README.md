Accounts LDAP
-------------

Authentication against an LDAP server for Meteor.

#### Overview

This is a package to implement authentication against an LDAP server and retrieval of user attributes from that server in Meteor. It is an adaptation of `hive:accounts-ldap`.

The things that this package does differently from `hive:accounts-ldap` are:

- UI matches that of the core package `accounts-ui`
- the UI can be replaced by adding another package
- user data (email address, etc.) is stored in the same format as that of the core package `accounts-password`
- users can authenticate using either username or email address
- LDAP settings can be set programatically or using a `settings.json` file
- this package can peacefully co-exist with the core `accounts-password` package
- there are hooks and methods that can be used for multi-tenant apps that store ldap connection info in collections

#### Installation

`meteor add babrahams:accounts-ldap`

#### Usage

Your server's URL and a DN or DNs to search will need to be set in a settings.json file as `serverUrl` and `serverDn`, respectively. In addition, you can select an array of `whiteListedFields` from an LDAP search to add to the `user.profile` field in the document created in `Meteor.users` . An example for the settings.json file is:

```
{
  "ldap": {
    "serverDn": "DC=ad,DC=university,DC=edu",
    "serverUrl": "ldap://ad.university.edu:389",
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

This is a hook you can use **on the server** when a user successfully signs in using LDAP (doesn't fire if the sign in is via the app database when using `LDAP.tryDBFirst`)
```
LDAP.onSignIn(function (userDocument, userData, ldapEntry) {
  // Do things to user document like Roles.removeUsersFromRoles(userDocument, 'admin')
});
```
The purpose of this hook is to let the app modify a user document if it finds conditions have changed on the LDAP server (e.g. the user is no longer an admin or has left the organization) and it needs to mirror this in its own db document(s). `this` in the function is the sign in request (an object) sent from the client (which contains the plain text password, as does the `userData` parameter). `userDoc`, `userData`, and `ldapEntry` are all objects.

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
if an email address was typed in the login form on the client, or, if a username was typed in the login form on the client, it is of this form:
```
{username: <username>}
```

A similar search condition should be returned by the function. `this` in this function's context is the request object received from the client.

**Note:** if there is a possibility that your Meteor app allows duplicate usernames or email addresses, you could overwrite this function. But, better than this, is to use `LDAP.multitenantIdentifier` as shown below.

To make sure a multi-tenant app doesn't get mixed up with duplicate usernames or passwords, set:

```
LDAP.multitenantIdentifier = 'tenant_id';
```
where `'tenant_id'` is a string that gives the name of a key from `request.data`, as sent from the client using `LDAP.data` (see above). The value associated with this key must be a unique id value for the tenant.

**Note:** if you use `LDAP.multitenantIdentifier`, then `LDAP.modifyCondition` will have no effect, as the package will create the user identifier for you. Also, a new field `ldapIdentifier` will be added to each document added to the `Meteor.users` collection by this package.

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

Overwrite the function below **on the server** to add custom fields to the new user document created when a user from the LDAP directory isn't found in the Meteor app's database (based on the 'condition' discussed above):
```
LDAP.addFields = function (person) {
  // `this` is the request from the client
  // `person` is the object returned from the LDAP server
  // return the fields that are to be added when creating a user as an object of {key: value} pairs
  return {};	
}
```

The following hook can be used **on the server**:
```
LDAP.onAddMultitenantIdentifier(function (ldapIdentifier, userDocument, userData) {
  // Do things to user document like Roles.setUserRoles(userDocument, 'admin', 'foo-organization')
});
```
The reason for this hook's existence is that when an existing user sucsessfully signs into a different tenant in an app that has `LDAP.multitenantIdentifier` set, this package will add a new value to the array in the `ldapIdentifier` field, but it won't deal with any of the extra fields created using `LDAP.addFields` (as these may have only been for new account creation).  However, if the app needs to update the user document due to the fact that this is the first time a user has signed in to this particular tenant (e.g. to add roles in this tenant's context), then this hook is available.

**Note:** the `userData` parameter contains the plain text password, so be careful what you do with the userData object.  For instance, don't stringify and log it somewhere insecure!

#### Built in UI

`{{> ldapLoginButtons}}` renders a template with username/email and password inputs. If login is successful, the user will be added to the `Meteor.users` collection. It is up to the app to publish and subscribe fields. By default, only the username is published.

#### Warning

Password is sent from client to server in plain text.  Only use this package in conjunction with SSL.

Although this package supports multi-tenancy, where each tenant has their own LDAP server, the connection between Meteor app server and LDAP server is unencrypted (waiting on a new version of `ldapjs` that supports TLS). Because plain text passwords are sent from the app to the LDAP server, you really shouldn't use this package in any app that sits outside the corporate firewall!

#### TODO

- make the sign in form more configurable with options like:
  - `unstyled=true` - to remove all classes
  - `alwaysOpen` - to make the form automatically open
  - `loggedOutLinkTemplate` - to replace the default link that you click to open the form
  - `loggedInLinkTemplate` - to replace the default link that you click to get the dropdown once logged in
- work on securing traffic from client through to LDAP server
- automated testing
  
#### Example code

_From a working multi-tenant app (where 'tenants' are called 'organizations')._

###### Client

```
LDAP.data = function () {
  return {organization_id: App.state.get('organization_id') || null};  
}
```

###### Server

```
LDAP.logging = false;
LDAP.tryDBFirst = true;

LDAP.generateSettings = function (request) {
  if (request.data && request.data.organization_id) {
	var organization_id = request.data.organization_id;
	check(organization_id, String);
	var organization = Organizations.findOne({_id: organization_id});
	if (organization.ldap) {
	  var ldapSettings = organization.ldap;
	  return {
		"serverDn": ldapSettings.serverDn,
		"serverUrl": ldapSettings.serverUrl,
		"whiteListedFields": [ldapSettings.displayNameField || "displayName"],
		"autopublishFields": []
	  };
	}
  }
  return null;  
}

LDAP.multitenantIdentifier = 'organization_id';

LDAP.onAddMultitenantIdentifier(function (addedIdentifier, userDoc, userData) {
  // `this` is the request object if we need it
  // currentOrganization needs to be set and so do roles
  var updates = {};
  if (userData && userData.currentOrganization) {
	// The relevant userData was set by the LDAP.addFields function below
	// But the user already existed, so roles and 
	Meteor.users.update({_id: userDoc._id}, {$set: {currentOrganization: userData.currentOrganization}}); 
	if (userData && userData.roles && userData.roles[userData.currentOrganization]) {
	  Roles.addUsersToRoles(userDoc._id, userData.roles[userData.currentOrganization], userData.currentOrganization);
	}
  }
});

LDAP.addFields = function (person) {
  var newUserFields = {};
  var organization_id = this.data && this.data.organization_id;
  if (organization_id) {
    newUserFields.currentOrganization = organization_id;
	if (userIsLeader(person, organization_id)) {
	  // This is sidestepping the roles package Roles.addUsersToRole function, but has the same effect
	  // The reason for this is, the user doesn't exist yet! (So we can't add roles to them.)
	  var roles = {};
	  roles[organization_id] = ["leader"];
	  newUserFields.roles = roles;
	}
  }
  return newUserFields;
}

LDAP.onSignIn(function (user, userData, ldapEntry) {
  // `this` is the request sent
  // Check whether the user is still a leader or has become a leader and act accordingly
  // Not much point to this, while LDAP.tryDBFirst = true; as onSignIn only fires when the LDAP server is hit
  // And it should never get hit again in subsequent sign ons unless the user changes organizations
  var person = ldapEntry;
  var isReallyLeader = userIsLeader(person, user.currentOrganization);
  var isLeaderinApp = Roles.userIsInRole(user, 'leader', user.currentOrganization);
  // If the person has stopped being a leader
  if (isLeaderinApp && !isReallyLeader) {
    Roles.removeUsersFromRoles(user, 'leader', user.currentOrganization);
  }
  if (!isLeaderinApp && isReallyLeader) {
	Roles.setUserRoles(user, 'leader', user.currentOrganization);  
  }
});

// LDAP specific function, which is why it's in this file
var userIsLeader = function (person, organization_id) {
  var leader = false;
  // Need to parse the LDAP object and determine whether this person is a leader in the organization
  if (organization_id) {
	var organization = Organizations.findOne({_id: organization_id});
	if (person.dn && organization && organization.ldap && organization.ldap.leaderDnContains && _.isArray(organization.ldap.leaderDnContains)) {
	  var leader = _.reduce(organization.ldap.leaderDnContains, function (memo, searchString) {
		if (person.dn.indexOf(searchString) === -1) {
		  memo = false;	
		}
		return memo;
	  }, true);
	}
  }
  return leader;
}
```

Documents from the `Organizations` collection look like this:

```
{
  "_id": "45JE8Q6zufss7Fwzx"
  "name": "My Organization",
  "ldap": {
    "serverDn": "OU=people,OU=we_like,DC=myorganization,DC=com",
    "serverUrl": "ldap://pdc.myorganization.com:389",
    "leaderDnContains": [
      "Leader",
      "Currently_Active"
    ]
  }
}
```