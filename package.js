Package.describe({
  'summary': 'Meteor account login via LDAP',
  'version': '0.1.0',
  'git' : 'https://github.com/babrahams/meteor-accounts-ldap',
  'name' : 'babrahams:accounts-ldap'
});

Npm.depends({'ldapjs' : '0.7.1', 'connect' : '2.19.3'});

Package.on_use(function (api) {
  api.use(['routepolicy', 'webapp'], 'server');
  api.use(['accounts-base', 'underscore'], ['client', 'server']);
  api.use('accounts-password','server');
  api.imply('accounts-base', ['client', 'server']);
  //api.use('srp', ['client_functions', 'server']);
  api.use(['ui', 'templating', 'jquery', 'spacebars', 'reactive-var', 'less'], 'client');
  api.export('LDAP');
  api.add_files([
    'ldap_client.html',
    'ldap_client.js',
	'ldap_client.less'], 'client');
  api.add_files('ldap_server.js', 'server');
});
