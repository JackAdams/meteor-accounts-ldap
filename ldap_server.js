LDAP = {
  logging: true,
  log: function (message) {
	if (LDAP.logging) {
	  console.log(message);
	}
  },
  multitenantIdentifier: ''
}; // { autoVerifyEmail : false };

// *************************************************
// Public methods that may be optionally overwritten
// *************************************************

// Overwrite this if you need a custom filter for your particular LDAP configuration

LDAP.filter = function (email, username) {
  return '(&(' + ((email) ? 'mail' : 'cn') + '=' + username + ')(objectClass=user))';
}

// Flag to tell the loginHandler to have a poke at the app database first
// (will only work if accounts-password package is present)
LDAP.tryDBFirst = false;

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

// *****************************************
// Private methods, not intended for app use
// *****************************************

LDAP._callbacks = {
  onAddMultitenantIdentifier: [],
  onSignIn: []
};

LDAP._addCallback = function (callback, target) {
  if (_.isFunction(callback)) {
	LDAP._callbacks[target].push(callback);
  }
  else {
	throw new Meteor.Error(target + ' callback must be a function');  
  }
}

LDAP._settings = function (request) {
  return LDAP.generateSettings(request) || Meteor.settings.ldap;
}

var ldap = Npm.require('ldapjs');
var Future = Npm.require('fibers/future');
var assert = Npm.require('assert');

LDAP._createClient = function(serverUrl) {
  var client = ldap.createClient({
    url: serverUrl
  });
  return client;
};

// If next version of ldapjs ever comes out
/*LDAP._starttls = function (client) {
  var success = null;
  
  // Start TLS with our LDAP client.
  LDAP.log ('Trying to start TLS ...');

  var tlsFuture = new Future();
  client.starttls(function (err) {
	LDAP.log ('Callback from starting TLS for LDAP:');
	if (err) {
	  LDAP.log(JSON.stringify(err));
	  LDAP.log('LDAP TLS startup failed with error');
	  LDAP.log(JSON.stringify({dn: err.dn, code: err.code, name: err.name, message: err.message}));
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

LDAP._bind = function (client, username, password, email, request, settings) {
  var success = null;
  //Bind our LDAP client.
  var serverDNs = (typeof (settings.serverDn) == 'string') ? [settings.serverDn] : settings.serverDn;
  for (var k in serverDNs) {
    var serverDn = serverDNs[k].split(/,?DC=/).slice(1).join('.');
    var userDn = (email) ? username : username + '@' + serverDn;

    LDAP.log ('Trying to bind ' + userDn + '...');

    var bindFuture = new Future();
    client.bind(userDn, password, function (err) {
      LDAP.log ('Callback from binding LDAP:');
      if (err) {
        LDAP.log(JSON.stringify(err));
        LDAP.log('LDAP bind failed with error');
        LDAP.log(JSON.stringify({dn: err.dn, code: err.code, name: err.name, message: err.message}));
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
    throw new Meteor.Error(403, "Invalid credentials");
  }
  return ;
};

LDAP._search = function (client, searchUsername, isEmail, request, settings) {
  // Search our previously bound connection. If the LDAP client isn't bound, this should throw an error.
  var opts = {
    filter: LDAP.filter.call(null, isEmail, searchUsername),
    scope: 'sub',
    timeLimit: 2
  };
  var serverDNs = (typeof(settings.serverDn) == 'string') ? [settings.serverDn] : settings.serverDn;
  var result = false;
  for (var k in serverDNs) {
    var searchFuture = new Future();
    var serverDn = serverDNs[k];
    LDAP.log ('Searching ' + serverDn);
    client.search(serverDn, opts, function(err, res) {
      userObj = {};
      if (err) {
        searchFuture.return(500);
      }
      else {
        res.on('searchEntry', function(entry) {
          var person = entry.object;
          var usernameOrEmail = searchUsername.toLowerCase();
          var username = (isEmail) ? person.cn || usernameOrEmail.split('@')[0] : usernameOrEmail;
          var email = (isEmail) ? usernameOrEmail : person.mail || username + '@' + serverDn.split(/,?DC=/).slice(1).join('.');
          userObj = {
            username: username,
            email: email,
            password: request.password,
            profile: _.pick(entry.object, _.without(settings.whiteListedFields, 'mail'))
          };
		  // _.extend({username: username, email : [{address: email, verified: LDAP.autoVerifyEmail}]}, _.pick(entry.object, _.without(settings.whiteListedFields, 'mail')));
          searchFuture.return({userObj: userObj, person: person, ldapIdentifierUsername: username}); 
        });
        res.on('searchReference', function (referral) {
          LDAP.log('referral: ' + referral.uris.join());
          searchFuture.return(false);
        });
        res.on('error', function(err) {
          LDAP.log('error: ' + err.message);
          searchFuture.return(false);
        });
        res.on('end', function(result) {
          if (_.isEmpty(userObj)) {
            //Our LDAP server gives no indication that we found no entries for our search, so we have to make sure our object isn't empty.
            LDAP.log("No result found.");
            searchFuture.return(false);
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

Accounts.registerLoginHandler("ldap", function (request) {
  if (!request.ldap) {
    return;  
  }
  if (LDAP.multitenantIdentifier && !(request.data && request.data[LDAP.multitenantIdentifier])) {
	LDAP.log('You need to set "' + LDAP.multitenantIdentifier + '" on the client using LDAP.data for multi-tenant support to work.');
	return;  
  }
  var username = request.username.toLowerCase();
  // Check if this is an email or a username
  var email = false;
  if (/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/.test(username)) {
     // It's an email
     var email = true;  
  }
  if (!!Package["accounts-password"] && LDAP.tryDBFirst) {
    // This is a blunt instrument and not up to MDG standard
    // see: https://github.com/meteor/meteor/blob/devel/packages/accounts-password/password_server.js
    // for a complete implementation
    var fieldName;
    var fieldValue;
	if (LDAP.multitenantIdentifier && request.data && request.data[LDAP.multitenantIdentifier]) {
	  // Making a big assumption here that username and email address text (before the @) are the same
	  // it's the best we can do and it doesn't matter too much if we're wrong
	  // It just means we're going to have to hit the LDAP server again instead of the app db
      var actualUsername = (email) ? username.split('@')[0] : username;
	  fieldName = 'ldapIdentifier';
	  fieldValue = request.data[LDAP.multitenantIdentifier] + '-' + actualUsername;
    }
	else {
	  if (!email) {
		fieldName = 'username';
		fieldValue = username;
	  }
	  else {
		fieldName = 'emails.address';
		fieldValue = username; // yes, `username` is actually an email address
	  }
    }
    var selector = {};
    selector[fieldName] = fieldValue;
    var user = Meteor.users.findOne(selector);
    if (user) {
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
  if (settings.debugMode === true) {
    userObj = {username: actualUsername};
	person = {};
  }
  else {
    LDAP.log('LDAP authentication for ' + request.username);
    var client = LDAP._createClient(settings.serverUrl);
	// For when next version of ldapjs comes out
	/*if (settings.TLS) {
	  var tlsStarted = LDAP._starttls(client);
	  if (!tlsStarted) {
		LDAP.log('Not trying to bind to LDAP server.');
		return;  
	  }
	}*/
    LDAP._bind(client, request.username, request.password, email, request, settings);
    var returnData = LDAP._search(client, request.username, email, request, settings);
	userObj = returnData.userObj;
	person = returnData.person;
	ldapIdentifierUsername = returnData.ldapIdentifierUsername;
    client.unbind();
  }
  
  // Automatically add an ldapIdentifier in multitenant situations
  if (LDAP.multitenantIdentifier) {
	if (request.data && request.data[LDAP.multitenantIdentifier]) {
	  userObj.ldapIdentifier = [request.data[LDAP.multitenantIdentifier] + '-' + ldapIdentifierUsername];
	}
  }
  
  // An app may wish to add some fields based on the object returned from the LDAP server
  userObj = _.extend(userObj, LDAP.addFields.call(request, person));
  
  LDAP.log("User successfully retrieved from LDAP server");
  LDAP.log(JSON.stringify(person));
  // LDAP.log("Details of user object to save (before modifications):" + JSON.stringify(userObj));
  
  var userId;
  var condition = {};
  if (email) {
    condition.emails = {$elemMatch: {address: username}}; // username is actually an email here 
  }
  else {
    condition.username = username;  
  }
  // If we have two users with the same username, or two users with the same email address, we have a problem
  // For situations like this, we might want to modify the condition to include extra fields
  // Possibly based on request.data passed from the client
  var ldapIdentifier = request.data[LDAP.multitenantIdentifier] + '-' + userObj.username
  condition = (LDAP.multitenantIdentifier && request.data && request.data[LDAP.multitenantIdentifier]) ? {ldapIdentifier: ldapIdentifier} : LDAP.modifyCondition.call(request, condition);
  var user = Meteor.users.findOne(condition);
  if (user) {
	LDAP.log('User found in app database: '+ JSON.stringify(user));
    userId = user._id;
    // Meteor.users.update(userId, {$set: userObj});
  }
  else {
	LDAP.log('Creating user: ' + JSON.stringify(userObj));
	var skip = false;
	try {
      userId = Accounts.createUser(userObj); // Meteor.users.insert(userObj);
	  user = Meteor.users.findOne({_id: userId});
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
		  LDAP.log('Adding a new ldapIdentifier: ' + userObj.ldapIdentifier[0]);
		  var condition = {};
		  condition.emails = {$elemMatch: {address: userObj.email}};
		  var user = Meteor.users.findOne(condition);
		  if (user) {
			var userId = user._id;
			// Add the ldapIdentifier
			Meteor.users.update({_id: userId}, {$addToSet: {ldapIdentifier: userObj.ldapIdentifier[0]}});
		    LDAP.log('Fields added using LDAP.addFields will be ignored');
		    skip = true;
		    LDAP.log('Use LDAP.onAddMultitenantIdentifier to add or update fields as needed in this situation');
		    _.each(LDAP._callbacks.onAddMultitenantIdentifier, function (callback) {
              callback.call(request, ldapIdentifier, user, userObj);
		    });
		  }
		  else {
			throw new Error('Operation failed unexpectedly.', 'User found in LDAP server, but couldn\'t be found in Meteor app. Check user record in database.'); 
		  }
		}
	  }
	  else {
		LDAP.log('Unable to create user');
		console.log(err);  
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
			  LDAP.log(err);  
			}
		  });
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
  Meteor.users.update(userId, {$push: {'services.resume.loginTokens': hashStampedToken}});
  return {
    userId: userId,
    token: stampedToken.token,
    tokenExpires: Accounts._tokenExpiration(hashStampedToken.when)
  };
});