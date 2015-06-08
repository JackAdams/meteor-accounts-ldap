LDAP = {
  data : function () { return null; }
};

var firstAttempt = true;
var showForm = new ReactiveVar(false);

Template.ldapLogin.events({
  'click #login-buttons-password': function(e, tpl) {
    initLogin(e,tpl);
  },
  'keyup input' : function (e, tpl){
    if (e.keyCode == 13){ //If Enter Key Pressed
        initLogin(e,tpl);
      }
  },
  'click #login-buttons-logout': function(e) {
    firstAttempt = true;
    Meteor.logout(function() {
	  showForm.set(false);
	});
  }
});

Meteor.loginWithLdap = function (username, password, callback) {
  Accounts.callLoginMethod({
    methodArguments: [{username: username, pwd: password, ldap: true, data: LDAP.data()}],
    validateResult: function (result) {
    },
    userCallback: callback
  });
};

Template.ldapLogin.helpers({
  failedLogin : function() {
    return !firstAttempt; //return true if more than one attempt has been made. Show Error Message
  }
});

Template.ldapLoginButtons.helpers({
  showForm : function() {
	return showForm.get();
  }
});

Template.ldapLoginButtons.events({
  'click .login-close-text' : function() {
    showForm.set(false);  
  },
  'click .login-link-text' : function() {
	showForm.set(true);
  }
});

// Initiate Login Process:
initLogin = function(e, tpl) {
    var username = $(tpl.find('input[name="ldap"]')).val();
    var password = $(tpl.find('input[name="password"]')).val();
    var result = Meteor.loginWithLdap(username, password, function() {
      if (Meteor.userId()) {
		showForm.set(false);
        return true;
	  }
      else {
        firstAttempt = false;
        return false;
      }
    });
    return result;
};
