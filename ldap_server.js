LDAP = {
  logging: true,
  log: function (message) {
    if (LDAP.logging) {
      console.log(message);
    }
  },
  warn: function (message) {
    LDAP.log(JSON.stringify(message));
  },
  error: function (message) {
    LDAP.log(JSON.stringify(message));
  },
  alwaysCreateAccountIf: null,
  multitenantIdentifier: '',
  searchField: 'cn',
  searchValueType: 'username',
  thumbnailPhotoField: 'thumbnailPhoto'
}; // { autoVerifyEmail : false };

// *************************************************
// Public methods that may be optionally overwritten
// *************************************************

// This provides the value that is used along with the user-submitted password to bind to the LDAP server

LDAP.bindValue = function (usernameOrEmail, isEmailAddress, FQDN) {
  return ((isEmailAddress) ? usernameOrEmail.split('@')[0] : usernameOrEmail) + '@' + FQDN;
}

// This filter, used with default settings for LDAP.searchField assumes that the part of the email address before the @ perfectly matches the cn value for each user
// Overwrite this if you need a custom filter for your particular LDAP configuration
// For example if everyone has the 'mail' field set, but the bit before the @ in the email address doesn't exactly match users' cn values, you could do:
// LDAP.filter = function (isEmailAddress, usernameOrEmail, FQDN) { return '(&(' + ((isEmailAddress) ? 'mail' : 'cn') + '=' + usernameOrEmail + ')(objectClass=user))'; }

LDAP.filter = function (isEmailAddress, usernameOrEmail, FQDN, settings) {
  var searchField = _.isFunction(LDAP.searchField) && LDAP.searchField.call(this) || settings.searchField || LDAP.searchField || 'cn';
  var searchValue = LDAP.searchValue.call(this, isEmailAddress, usernameOrEmail, FQDN, settings);
  var searchFilter = '(&(' + searchField + '=' + searchValue + ')(objectClass=user))';
  LDAP.log('Search filter: ' + searchFilter);
  return searchFilter;
}

// This is the search value that gets used in the LDAP.filter function above
// which gets called from the LDAP._search function below, when trying to isolate a user
// from the directory.
// Overwrite so that it matches your specific directory structure

LDAP.searchValue = function (isEmailAddress, usernameOrEmail, FQDN, settings) {
  var username = (isEmailAddress) ? usernameOrEmail.split('@')[0] : usernameOrEmail;
  var searchValue;
  var searchValueType = (_.isFunction(LDAP.searchValueType)) && LDAP.searchValueType.call(this) || settings.searchField || LDAP.searchValueType || 'username';
  switch (searchValueType) {
    case 'userPrincipalName' :
      searchValue = username + '@' + FQDN;
      break;
    case 'email' :
      searchValue = (isEmailAddress) ? userNameOrEmail : username + '@' + FQDN; // If it's not an email address, we're kind of guessing
      break;
    case 'username' :
    default :
      searchValue = username;
  }
  return searchValue;
}

// Flag to tell the loginHandler to have a poke at the app database first
// (will only work if accounts-password package is present)
LDAP.tryDBFirst = false;

// The default
LDAP.userLookupQuery = function (fieldName, fieldValue, isEmail, isMultitenantIdentifier) {
  // Context (this) is the request sent from client
  var selector = {};
  selector[fieldName] = fieldValue;
  // Must return a mongo selector -- e.g. {username: "jackadams"} or {"email.address": "example@example.com"}
  return selector;
}

// this contains the LDAP attributes to fetch - an empty array means all user attributes
LDAP.attributes = [];

LDAP.addFields = function (entry) {
  // `this` is the request from the client
  // `entry` is the object returned from the LDAP server
  // return the fields that are to be added when creating a user
  return {};
}

// Overwrite this function to produce settings based on the incoming request
LDAP.generateSettings = function (request) {
  return null;
}

// Overwrite this function to modify the condition used to find an existing user
LDAP.modifyCondition = function (condition) {
  // `this` is the request received from the client
  return condition;
}

LDAP.onSignIn = function (callback) {
  LDAP._addCallback(callback, 'onSignIn');
}

LDAP.onAddMultitenantIdentifier = function (callback) {
  LDAP._addCallback(callback, 'onAddMultitenantIdentifier');
}

// Overwrite this function if the app needs to do something to modify the username of the users in the app database
// i.e. the username field in the app is different from the username field in the directory accessed via LDAP
LDAP.appUsername = function (userNameOrEmail, isEmail, userObj) {
  // userObj is the best guess we've got for email and username, one of which successfully retrieved a user from the directory using LDAP
  // `this` is the request received from the client
  return (isEmail) ? userNameOrEmail.split('@')[0] : userNameOrEmail;
}

// *****************************************
// Private methods, not intended for app use
// *****************************************

LDAP._stringifyUniqueIdentifier = function (uniqueIdentifier) {
  var stringified = JSON.stringify(uniqueIdentifier);
  return stringified.substr(1, stringified.length - 2);
}

LDAP._serverDnToFQDN = function (serverDn) {
  return serverDn.toLowerCase().replace(/\s+/g, '').split(/,?dc=/).slice(1).join('.');
}

LDAP._callbacks = {
  onAddMultitenantIdentifier: [],
  onSignIn: []
};

LDAP._addCallback = function (callback, target) {
  if (_.isFunction(callback)) {
    LDAP._callbacks[target].push(callback);
  }
  else {
    throw new Meteor.Error('callback-not-function', target + ' callback must be a function');
  }
}

LDAP._settings = function (request) {
  return LDAP.generateSettings(request) || Meteor.settings.ldap;
}

var ldap = Npm.require('ldapjs');
var Future = Npm.require('fibers/future');
var assert = Npm.require('assert');

LDAP._createClient = function () {
  var client = null;
  var settings = this;
  var serverUrl = settings.serverUrl;
 /*  if (serverUrl.indexOf('ldaps://') === 0 && settings.ldapsCertificate) {
    client = ldap.createClient({
      url: serverUrl,
      tlsOptions: _.isFunction(LDAP.tlsOptions) ? LDAP.tlsOptions(settings) : {
        // ca: [settings.ldapsCertificate]
        'rejectUnauthorized': false
      }
    });
  }
  else { */
    client = ldap.createClient({
      url: serverUrl
    });
  // }

  client.on('error', function (error) {
    LDAP.error('ldapjs client reported an error: ', error);
    client.destroy();
    // throw new Meteor.Error('ldap-error', 'ldapjs client reported an error', error);
  });

  return client;
};

/*LDAP._starttls = function (client) {
  var success = null;

  // Start TLS with our LDAP client.
  LDAP.log ('Trying to start TLS ...');

  var tlsFuture = new Future();
  client.starttls(function (err) {
    LDAP.log ('Callback from starting TLS for LDAP:');
    if (err) {
      LDAP.error(JSON.stringify(err));
      LDAP.error('LDAP TLS startup failed with error');
      LDAP.error(JSON.stringify({dn: err.dn, code: err.code, name: err.name, message: err.message}));
      tlsFuture.return(false);
    } else {
      tlsFuture.return(true);
    }
  });
  success = tlsFuture.wait();

  if (!success) {
    throw new Meteor.Error("Could not start TLS");
  }
  return success;
};*/

LDAP._bind = function (client, username, password, isEmail, request, settings) {
  var success = null;
  //Bind our LDAP client.
  var serverDNs = (typeof (settings.serverDn) == 'string') ? [settings.serverDn] : settings.serverDn;
  for (var k in serverDNs) {
    var FQDN = LDAP._serverDnToFQDN(serverDNs[k]);
    var userDn = LDAP.bindValue.call(request, username, isEmail, FQDN);

    LDAP.log ('Trying to bind ' + userDn + '...');

    var bindFuture = new Future();
    client.bind(userDn, password, function (err) {
      LDAP.log ('Callback from binding LDAP:');
      if (err) {
        LDAP.error('LDAP bind failed with error:');
        LDAP.error(JSON.stringify(err));
        // LDAP.error(JSON.stringify({dn: err.dn, code: err.code, name: err.name, message: err.message}));
        bindFuture.return(false);
      } else {
        bindFuture.return(true);
      }
    });
    success = bindFuture.wait();
    if (success) {
      break;
    }
  }

  if (!success || password === '') {
    if (_.isFunction(LDAP.alwaysCreateAccountIf) && LDAP.alwaysCreateAccountIf(request) && username && password) {
      return true; // true that we should create a user
    }
    else {
      throw new Meteor.Error(403, "Invalid credentials");
    }
  }
  return;
};

LDAP._search = function (client, searchUsername, isEmail, request, settings) {
  // Search our previously bound connection. If the LDAP client isn't bound, this should throw an error.
  var opts = {
    scope: 'sub',
    timeLimit: 2,
    attributes: LDAP.attributes
  };
  var serverDNs = (typeof(settings.serverDn) == 'string') ? [settings.serverDn] : settings.serverDn;
  var result = false;
  for (var k in serverDNs) {
    var searchFuture = new Future();
    var serverDn = serverDNs[k];
    opts.filter = LDAP.filter.call(request, isEmail, searchUsername, LDAP._serverDnToFQDN(serverDn), settings);
    LDAP.log ('Searching ' + serverDn);
    client.search(serverDn, opts, function (err, res) {
      userObj = {};
      if (err) {
        if (!searchFuture.isResolved()) {
          searchFuture.return(500);
        }
      }
      else {
        res.on('searchEntry', function (entry) {
          if (!searchFuture.isResolved()) {
            var person = entry.object;
            if (entry.raw && entry.raw.thumbnailPhoto) {
              person.thumbnailPhoto = entry.raw.thumbnailPhoto.toString('base64');
            }
            var usernameOrEmail = searchUsername.toLowerCase();
            var username = (isEmail) ? usernameOrEmail.split('@')[0] : usernameOrEmail; // Used to have: person.cn || usernameOrEmail.split('@')[0] -- guessing the username based on the email is pretty poor
            var email = (isEmail) ? usernameOrEmail.toLowerCase() : username.toLowerCase() + '@' + LDAP._serverDnToFQDN(serverDn); // (isEmail) ? usernameOrEmail : person.mail ||
            userObj = {
              username: username,
              email: (isEmail) ? usernameOrEmail : person.mail || email, // best we can do with the info we have
              password: request.password,
              profile: _.pick(person, _.without(settings.whiteListedFields, 'mail'))
            };
            userObj.username = LDAP.appUsername.call(request, username, isEmail, userObj);
            // _.extend({username: username, email : [{address: email, verified: LDAP.autoVerifyEmail}]}, _.pick(entry.object, _.without(settings.whiteListedFields, 'mail')));
            searchFuture.return({userObj: userObj, person: person, ldapIdentifierUsername: username});
          }
        });
        res.on('searchReference', function (referral) {
          LDAP.log('referral: ' + referral.uris.join());
          if (!searchFuture.isResolved()) {
            searchFuture.return(false);
          }
        });
        res.on('error', function (err) {
          LDAP.error('error: ' + err.message);
          if (!searchFuture.isResolved()) {
            searchFuture.return(false);
          }
        });
        res.on('end', function (result) {
          if (_.isEmpty(userObj)) {
            //Our LDAP server gives no indication that we found no entries for our search, so we have to make sure our object isn't empty.
            LDAP.log("No result found.");
            if (!searchFuture.isResolved()) {
              searchFuture.return(false);
            }
          }
          LDAP.log('status: ' + result.status);
        });
      }
    });
    result = searchFuture.wait();
    if (result) {
      return result;
    }
  }
  //If we're in debugMode, return an object with just the username. If not, return null to indicate no result was found.
  if (settings.debugMode === true) {
    return {username: searchUsername.toLowerCase()};
  }
  else {
    return null;
  }
};

// This is the Meteor specific login handler
Accounts.registerLoginHandler("ldap", function (request) {
  if (!request.ldap) {
    return;
  }
  if (LDAP.multitenantIdentifier && !(request.data && request.data[LDAP.multitenantIdentifier])) {
    LDAP.warn('You need to set "' + LDAP.multitenantIdentifier + '" on the client using LDAP.data for multi-tenant support to work.');
    return;
  }
  var whatUserTyped = request.username.toLowerCase();
  // Check if this is an email or a username
  var isEmail = false;
  var pieces = whatUserTyped.split('@');
  if (pieces.length === 2) {
     if (pieces[1].indexOf('.') > 0) {
       // It's an email
       var isEmail = true;
     }
  }
  if (!!Package["accounts-password"] && (LDAP.tryDBFirst || (_.isFunction(LDAP.alwaysCreateAccountIf) && LDAP.alwaysCreateAccountIf(request)))) {
    // This is a blunt instrument and not up to MDG standard
    // see: https://github.com/meteor/meteor/blob/devel/packages/accounts-password/password_server.js
    // for a complete implementation
    var fieldName;
    var fieldValue;
    var user = null;
    var isMultitenantIdentifier = false;
    if (LDAP.multitenantIdentifier && request.data && request.data[LDAP.multitenantIdentifier]) {
      isMultitenantIdentifier = true;
      // Making a big assumption here that username and email address text (before the @) are the same
      // it's the best we can do and it doesn't matter too much if we're wrong
      // It just means we're going to have to hit the directory server via LDAP again instead of only the app db
      var tempUserObj = {
        username: whatUserTyped.split('@')[0],
        email: whatUserTyped.toLowerCase(), // this is only going to work for emails -- if we only have a username to work with, there's no way of knowing the domain
        password: request.password
      };
      fieldName = 'ldapIdentifier';
      fieldValue = request.data[LDAP.multitenantIdentifier] + '-' + LDAP.appUsername.call(request, whatUserTyped, isEmail, tempUserObj);
      // TODO -- What about users in the same tenant with same username?
      // Currently, apps need to ensure a single tenant's users have unique usernames.
      // Also note: username is a field in the db where uniqueness is enforced by an index
      if (!isEmail) {
        backupFieldName = 'username';
        backupFieldValue = whatUserTyped;
      }
      else {
        backupFieldName = 'emails.address';
        backupFieldValue = whatUserTyped; // here `whatUserTyped` is apparently an email address
      }
    }
    else {
      if (!isEmail) {
        fieldName = 'username';
        fieldValue = whatUserTyped;
      }
      else {
        fieldName = 'emails.address';
        fieldValue = whatUserTyped; // here `whatUserTyped` is apparently an email address
      }
    }
    var userLookupQuery = LDAP.userLookupQuery.call(request, fieldName, fieldValue, isEmail, isMultitenantIdentifier);
    user = Meteor.users.findOne(userLookupQuery);
	  if (!user && isMultitenantIdentifier) {
      // try again with backup query
      var userLookupQuery = LDAP.userLookupQuery.call(request, backupFieldName, backupFieldValue, isEmail, false);
      user = Meteor.users.findOne(userLookupQuery);
    }
    if (user && user.services && user.services.password && user.services.password.bcrypt && request.pwd) {
      var res = Accounts._checkPassword(user, request.pwd);
      if (!res.error) {
        LDAP.log('User successfully logged in from app database. LDAP server not used.');
        LDAP.log('Set `LDAP.tryDBFirst = false` to always use LDAP server.');
        return res;
      }
    }
  }
  request.password = request.pwd; // Dodging the Accounts.loginWithPassword check
  var settings = LDAP._settings(request);
  if (!settings) {
    throw new Error("LDAP settings missing.");
  }
  var userObj, person, ldapIdentifierUsername;
  if (settings.debugMode === true) {
    userObj = {username: (isEmail) ? whatUserTyped.split('@')[0] : whatUserTyped};
    person = {};
  }
  else {
    LDAP.log('LDAP authentication for: ' + request.username);
    var client = LDAP._createClient.call(settings);
    // For when next version of ldapjs comes out
    /*if (settings.TLS) {
      var tlsStarted = LDAP._starttls(client);
      if (!tlsStarted) {
        LDAP.warn('TLS not started. Not trying to bind to LDAP server.');
        return;
      }
    }*/
    var bindFailedButCreateUserAnyway = LDAP._bind(client, request.username, request.password, isEmail, request, settings);
    if (!bindFailedButCreateUserAnyway) {
      var returnData = LDAP._search(client, request.username, isEmail, request, settings);
      if (!returnData || !(returnData.userObj && returnData.person)) {
        LDAP.log('No record was returned via LDAP');
        return; // Login handlers need to return undefined if the login fails
      }
      userObj = returnData.userObj;
      person = returnData.person;
      ldapIdentifierUsername = returnData.ldapIdentifierUsername;
      client.unbind();
    }
    else {
      if (isEmail) {
        userObj = {
          username: whatUserTyped.split('@')[0],
          email: whatUserTyped.toLowerCase(),
          password: request.password,
          profile: {
            notFromLDAP: true  
          }
        };
        userObj.username = LDAP.appUsername.call(request, userObj.username, isEmail, userObj);
        person = {
          displayName: userObj.username,
          mail: userObj.email,
          notFromLDAP: true
        };
      }
      else {
        // Need an email to always create an account
        throw new Meteor.Error(401, "Email address required");
      }
    }
  }

  // Automatically add an ldapIdentifier in multitenant situations
  if (LDAP.multitenantIdentifier && ldapIdentifierUsername) {
    if (request.data && request.data[LDAP.multitenantIdentifier]) {
      userObj.ldapIdentifier = [request.data[LDAP.multitenantIdentifier] + '-' + ldapIdentifierUsername];
    }
  }

  // An app may wish to add some fields based on the object returned from the LDAP server
  userObj = _.extend(userObj, LDAP.addFields.call(request, person));

  if (bindFailedButCreateUserAnyway) {
    LDAP.log("Logging in ... (user will be automatically created from login details, if necessary): " + person.displayName);  
  }
  else {
    LDAP.log("User successfully retrieved from LDAP server: " + person.displayName);
  }
  // LDAP.log(JSON.stringify(person));
  LDAP.log("Details of user object to save (before modifications):" + JSON.stringify(userObj));

  var userId;
  if (_.isString(settings.uniqueIdentifier) && person[settings.uniqueIdentifier] && !bindFailedButCreateUserAnyway) {
    // Try to find a user the matches the unique identifier
    // This supercedes the multitenantIdentifier
    // The uniqueIdentifier must be guaranteed to be globally unique
    var uniqueIdentifier = LDAP._stringifyUniqueIdentifier(person[settings.uniqueIdentifier]);
    var query = {ldapIdentifier: uniqueIdentifier};
    var user = Meteor.users.findOne(query);
    if (user) {
      userId = user._id;
      LDAP.log('User found in app database by uniqueIdentifier: ' + JSON.stringify(user));
    }
  }
  if (!userId) {
    var condition = {};
    if (isEmail) {
      condition.emails = {$elemMatch: {address: whatUserTyped}};
    }
    else {
      condition.username = LDAP.appUsername.call(request, whatUserTyped, isEmail, userObj);
    }
    if (LDAP.multitenantIdentifier && request.data && request.data[LDAP.multitenantIdentifier] && ldapIdentifierUsername) {
      var ldapIdentifier = request.data[LDAP.multitenantIdentifier] + '-' + ldapIdentifierUsername;
      condition = {ldapIdentifier: ldapIdentifier};
    }
    else {
      // If we have two users with the same username, or two users with the same email address, we have a problem
      // For situations like this, we might want to modify the condition to include extra fields
      // Possibly based on request.data passed from the client
      // This is why we have the LDAP.modifyCondition function available to overwrite
      condition = LDAP.modifyCondition.call(request, condition, userObj);
    }
    var user = Meteor.users.findOne(condition);
    if (user) {
      if (bindFailedButCreateUserAnyway) {
        var res = Accounts._checkPassword(user, request.pwd);
        if (res.error) {
          LDAP.log('User found in app database but password wrong.');
          throw new Meteor.Error(403, 'Invalid credentials');
        }
      }
      LDAP.log('User found in app database: '+ JSON.stringify(user));
      userId = user._id;
      // Meteor.users.update(userId, {$set: userObj});
    }
    else {
      // Need to remove password as this gets logged
      var clonedUserObj = _.clone(userObj);
      clonedUserObj.password = 'xxxxxx';
      LDAP.log('Creating user: ' + JSON.stringify(clonedUserObj));
      var skip = false;
      try {
        var allowedFields = ['username', 'email', 'password', 'profile'];
        var extraFields = {};
        var tempUserObj = {};
        _.each(userObj, function (val, key) {
          if (_.contains(allowedFields, key)) {
            tempUserObj[key] = (key === 'username') ? LDAP.appUsername.call(request, whatUserTyped, isEmail, userObj) : val;
          }
          else {
            extraFields[key] = val;
          }
        });
        if (!extraFields.ldapIdentifier && LDAP.multitenantIdentifier && request.data && request.data[LDAP.multitenantIdentifier]) {
          var newLdapIdentifier = (bindFailedButCreateUserAnyway) ? request.data[LDAP.multitenantIdentifier] + '-' + LDAP.appUsername.call(request, whatUserTyped, isEmail, userObj) : userObj.ldapIdentifier[0];
          extraFields.ldapIdentifier = [newLdapIdentifier];
        }
        userId = Accounts.createUser(tempUserObj);
        user = Meteor.users.findOne({_id: userId});
        if (user && !_.isEmpty(extraFields)) {
          Meteor.users.update({_id: userId}, {$set: extraFields});
        }
      }
      catch (err) {
        if (err.error === 403 && userObj.email) {
          // Email already exists
          // the reason for this is that no user was found in the database based on the condition
          // because the condition was using the multitenantIdentifier.
          // i.e. the user was created without using the current organization's multitenantIdentifier
          // Emails are unique to individual, so we will use the email address to get the user and
          // we'll add the correct ldapIdentifier to the user document
          // and fire a callback to let the app know that we've added a ldapIdentifier
          LDAP.log('Account with this email already exists.');
          if (LDAP.multitenantIdentifier && request.data && request.data[LDAP.multitenantIdentifier]) {
            var newLdapIdentifier = (bindFailedButCreateUserAnyway) ? request.data[LDAP.multitenantIdentifier] + '-' + LDAP.appUsername.call(request, whatUserTyped, isEmail, userObj) : userObj.ldapIdentifier[0];
            var condition = {};
            condition.emails = {$elemMatch: {address: userObj.email}};
            var user = Meteor.users.findOne(condition);
            if (bindFailedButCreateUserAnyway) {
              var res = Accounts._checkPassword(user, request.pwd);
              if (res.error) {
                LDAP.log('User found in app database but password wrong.');
                throw new Meteor.Error(403, 'Invalid credentials');
              }
            }
            if (user) {
              LDAP.log('Adding a new ldapIdentifier: ' + newLdapIdentifier);
              var userId = user._id;
              // Add the ldapIdentifier
              Meteor.users.update({_id: userId}, {$addToSet: {ldapIdentifier: newLdapIdentifier}});
              LDAP.log('Fields added using LDAP.addFields will be ignored.');
              skip = true;
              LDAP.log('Use LDAP.onAddMultitenantIdentifier to add or update fields as needed in this situation.');
              _.each(LDAP._callbacks.onAddMultitenantIdentifier, function (callback) {
                callback.call(request, ldapIdentifier, user, userObj);
              });
            }
            else {
              throw new Error('Operation failed unexpectedly.', 'User found in directory accessed via LDAP, but couldn\'t be found in Meteor app database. Check user record in database.');
            }
          }
        }
        else {
          LDAP.error('Unable to create user.');
          LDAP.error(err);
        }
      }
      if (!skip) {
        LDAP.log('New user _id: ' + userId);
        if (userId && userObj) {
          delete userObj.username;
          delete userObj.email;
          delete userObj.password;
          delete userObj.profile;
          // Because Accounts.createUser only accepts username, email, password and profile fields
          if (!_.isEmpty(userObj)) {
            Meteor.users.update({_id: userId}, {$set: userObj}, function (err, res) {
              if (err) {
                LDAP.error(err);
              }
            });
          }
        }
      }
    }
  }
  if (settings.autopublishFields) {
    Accounts.addAutopublishFields({
      forLoggedInUser: settings.autopublishFields,
      forOtherUsers: settings.autopublishFields
    });
  }
  // Fire onSignIn callbacks
  _.each(LDAP._callbacks.onSignIn, function (callback) {
    callback.call(request, user, userObj, person);
  });
  var stampedToken = Accounts._generateStampedLoginToken();
  var hashStampedToken = Accounts._hashStampedToken(stampedToken);
  var pushToUser = {'services.resume.loginTokens': hashStampedToken};
  if (_.isString(settings.uniqueIdentifier) && person[settings.uniqueIdentifier]) {
    var uniqueIdentifier = LDAP._stringifyUniqueIdentifier(person[settings.uniqueIdentifier]);
    if (!_.contains(user.ldapIdentifier || [], uniqueIdentifier)) {
      pushToUser.ldapIdentifier = uniqueIdentifier;
    }
  }
  Meteor.users.update(userId, {$push: pushToUser});
  return {
    userId: userId,
    token: stampedToken.token,
    tokenExpires: Accounts._tokenExpiration(hashStampedToken.when)
  };
});