LDAP = {
  data : function () { return null; },
  username : function (user) { return ''; },
  onSuccessfulLogin : function (userId) { },
  extraFormFields: new ReactiveVar([])
};

var firstAttempt = new ReactiveVar(true);
var showForm = new ReactiveVar(false);
var customFormTemplate = new ReactiveVar('');
var creatingAccount = new ReactiveVar(false);
var errorMessage = new ReactiveVar('Invalid sign in details');

LDAP.customFormTemplate = customFormTemplate;

LDAP.formHelpers = {
  failedLogin : function () {
    return !firstAttempt.get(); // return true if more than one attempt has been made. Show Error Message
  },
  errorMessage : function () {
    return errorMessage.get();
  },
  extraFormFields: function () {
	return LDAP.extraFormFields.get();  
  }
};

LDAP.formEvents = {
  'click #login-buttons-password': function (e, tpl) {
    initLogin(e, tpl);
  },
  'keydown input' : function (e, tpl) {
    if (e.keyCode === 13) { //If Enter Key Pressed
      e.preventDefault();
      initLogin(e, tpl);
    }
  },
  'click #login-buttons-logout': function (e) {
    firstAttempt.set(true);
    Meteor.logout(function () {
      showForm.set(false);
    });
  },
  'submit form' : function (evt) {
    // Although this is not a form elememt, custom UIs may use a form element
    // we need to prevent the default behaviour of submitting the form
    evt.preventDefault();
  }
};

Meteor.loginWithLdap = function (username, password, extraFieldData, callback) {
  var methodArguments = {username: username, pwd: password, ldap: true, data: _.extend(LDAP.data() || {}, extraFieldData)};
  Accounts.callLoginMethod({
    methodArguments: [methodArguments],
    validateResult: function (result) {
    },
    userCallback: callback
  });
};

Template.ldapLogin.helpers(LDAP.formHelpers);

Template.ldapLogin.events(LDAP.formEvents);

Template.ldapLoginButtons.helpers({
  showForm : function () {
    return showForm.get();
  },
  template : function () {
    return !!Template[LDAP.customFormTemplate.get()] && LDAP.customFormTemplate.get() || "";
  },
  usernameOrEmail : function () {
    return (_.isFunction(LDAP.username) && LDAP.username.call(this, this)) || this.username || (this.emails && this.emails[0] && this.emails[0].address) || 'Authenticated user';
  }
});

Template.ldapLoginButtons.events({
  'click .login-close-text' : function () {
    showForm.set(false);
  },
  'click .login-link-text' : function () {
    showForm.set(true);
  }
});

// Initiate Login Process:
initLogin = function (e, tpl) {
  firstAttempt.set(true);
  errorMessage.set('Invalid sign in details');
  var username = $(tpl.find('input[name="ldap"]')).val();
  var password = $(tpl.find('input[name="password"]')).val();
  var extraFieldData = {};
  $('.login-extra-field').each(function (i, e) {
	var field = Blaze.getData($(e)[0]);
	extraFieldData[field.field] = $(e).val();
  });
  var result = Meteor.loginWithLdap(username, password, extraFieldData, function (err, res) {
    if (Meteor.userId()) {
      showForm.set(false);
      LDAP.onSuccessfulLogin(Meteor.user());
      return true;
    }
    else {
      firstAttempt.set(false);
      if (err && err.error === 401) {
        alert("If you don't have an account provided, you need to sign in using an email address");
      }
      return false;
    }
  });
  return result;
};