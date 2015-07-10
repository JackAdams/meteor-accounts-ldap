LDAP = {}; // { autoVerifyEmail : false };

var ldap = Npm.require('ldapjs');
var Future = Npm.require('fibers/future');
var assert = Npm.require('assert');

LDAP.filter = function (email, username) {
  return '(&(' + ((email) ? 'mail' : 'cn') + '=' + username + ')(objectClass=user))';
}

LDAP.tryDBFirst = false;

LDAP.createClient = function(serverUrl) {
  var client = ldap.createClient({
    url: serverUrl
  });
  return client;
};

LDAP.bind = function (client, username, password, email, request, settings) {
  var success = null;
  //Bind our LDAP client.
  var serverDNs = (typeof (settings.serverDn) == 'string') ? [settings.serverDn] : settings.serverDn;
  for (var k in serverDNs) {
    var serverDn = serverDNs[k].split(/,?DC=/).slice(1).join('.');
    var userDn = (email) ? username : username + '@' + serverDn;

    console.log ('Trying to bind ' + userDn + '...');

    var bindFuture = new Future();
    client.bind(userDn, password, function (err) {
      console.log ('Callback from binding LDAP:');
      if (err) {
        console.log(err);
        console.log('LDAP bind failed with error');
        console.log({dn: err.dn, code: err.code, name: err.name, message: err.message});
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

LDAP.search = function (client, searchUsername, email, request, settings) {
  // Search our previously bound connection. If the LDAP client isn't bound, this should throw an error.
  var opts = {
    filter: LDAP.filter.call(null, email, searchUsername),
    scope: 'sub',
    timeLimit: 2
  };
  var serverDNs = (typeof(settings.serverDn) == 'string') ? [settings.serverDn] : settings.serverDn;
  var result = false;
  for (var k in serverDNs) {
    var searchFuture = new Future();
    var serverDn = serverDNs[k];
    console.log ('Searching '+serverDn);
    client.search(serverDn, opts, function(err, res) {
      userObj = {};
      if (err) {
        searchFuture.return(500);
      }
      else {
        res.on('searchEntry', function(entry) {
		  var person = entry.object;
		  var usernameOrEmail = searchUsername.toLowerCase();
		  var username = (email) ? person.cn || usernameOrEmail.split('@')[0] : usernameOrEmail;
		  var email = (email) ? usernameOrEmail : person.mail || username + '@' + serverDn.split(/,?DC=/).slice(1).join('.');
          userObj = {
			username: username,
			email: email,
			password: request.password,
			profile: _.pick(entry.object, _.without(settings.whiteListedFields, 'mail'))
		  };// _.extend({username: username, email : [{address: email, verified: LDAP.autoVerifyEmail}]}, _.pick(entry.object, _.without(settings.whiteListedFields, 'mail')));
          searchFuture.return(userObj); 
        });
        res.on('searchReference', function (referral) {
          console.log('referral: ' + referral.uris.join());
          searchFuture.return(false);
        });
        res.on('error', function(err) {
          console.error('error: ' + err.message);
          searchFuture.return(false);
        });
        res.on('end', function(result) {
          if (_.isEmpty(userObj)) {
            //Our LDAP server gives no indication that we found no entries for our search, so we have to make sure our object isn't empty.
            console.log("No result found.");
            searchFuture.return(false);
          }
          console.log('status: ' + result.status);
        });
      }
    });
    result = searchFuture.wait();
    if (result) {
      return result;
    }
  }
  //If we're in debugMode, return an object with just the username. If not, return null to indicate no result was found.
  if(settings.debugMode === true) {
    return {username: searchUsername.toLowerCase()};
  } else {
    return null;
  }
};

Accounts.registerLoginHandler("ldap", function (request) { console.log("request:", request);
  if (!request.ldap) {
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
    if (!email) {
      fieldName = 'username';
      fieldValue = request.username;
    }
	else {
      fieldName = 'emails.address';
      fieldValue = request.username; // yes, `request.username` is actually an email address
    }
    var selector = {};
    selector[fieldName] = fieldValue; console.log("Selector:",selector);
    var user = Meteor.users.findOne(selector);
	if (user){
	  var res = Accounts._checkPassword(user, request.pwd);
	  if (!res.error) {
	    return res;
	  }
	}
  }
  request.password = request.pwd; // Dodging the Accounts.loginWithPassword check
  var settings = LDAP.settings(request);
  if (!settings) {
    throw new Error("LDAP settings missing.");
  }
  if (settings.debugMode === true) {
    userObj = {username: username};
  }
  else {
    console.log('LDAP authentication for ' + request.username);
    var client = LDAP.createClient(settings.serverUrl);
    LDAP.bind(client, request.username, request.password, email, request, settings);
    userObj = LDAP.search(client, request.username, email, request, settings);
    client.unbind();
  }

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
  condition = LDAP.modifyCondition(condition);
  var user = Meteor.users.findOne(condition);
  if (user) {
    userId = user._id;
    // Meteor.users.update(userId, {$set: userObj});
  }
  else {
    userId = Accounts.createUser(userObj); // Meteor.users.insert(userObj);
  }
  if (settings.autopublishFields) {
    Accounts.addAutopublishFields({
      forLoggedInUser: settings.autopublishFields,
      forOtherUsers: settings.autopublishFields
    });
  }
  var stampedToken = Accounts._generateStampedLoginToken();
  var hashStampedToken = Accounts._hashStampedToken(stampedToken);
  Meteor.users.update(userId, {$push: {'services.resume.loginTokens': hashStampedToken}});
  return {
    userId: userId,
    token: stampedToken.token,
    tokenExpires: Accounts._tokenExpiration(hashStampedToken.when)
  };
});

// Don't overwrite this
LDAP.settings = function (request) {
  return LDAP.generateSettings(request) || Meteor.settings.ldap;
}

// Overwrite this function to produce settings based on the incoming request
LDAP.generateSettings = function (request) {
  return null;	
}

// Overwrite this function to modify the condition used to find an existing user
LDAP.modifyCondition = function (condition) {
  return condition;	
}