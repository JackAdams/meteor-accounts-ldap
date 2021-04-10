Package.describe({
  name : 'babrahams:accounts-ldap',
  summary: 'Meteor account login via LDAP',
  version: '0.9.6',
  git : 'https://github.com/JackAdams/meteor-accounts-ldap',
  documentation: 'README.md'
});

Npm.depends({'ldapjs' : '1.0.2', 'connect' : '2.19.3'});

Package.on_use(function (api) {
  api.versionsFrom('1.8.2');
  api.use(['routepolicy', 'webapp'], 'server');
  api.use(['accounts-base', 'underscore', 'less@3.0.1'], ['client', 'server']);
  api.use('accounts-password', 'server');
  api.imply('accounts-base', ['client', 'server']);
  api.use(['templating@1.3.2','blaze@2.3.4','spacebars@1.0.15','jquery@1.11.11', 'reactive-var'], 'client');
  api.add_files([
    'ldap_client.html',
    'ldap_client.js',
    'ldap_client.less'], 'client');
  api.add_files('ldap_server.js', 'server');
  api.export('LDAP');
});