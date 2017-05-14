const express = require('express');
const http = require('http');
const Emitter = require('events').EventEmitter;

const oauthCreds = require('./client_id.json');
const oauth2 = require('simple-oauth2').create({
  client: {
    id: oauthCreds.installed.client_id,
    secret: oauthCreds.installed.client_secret
  },
  auth: {
    tokenHost: 'https://www.googleapis.com',
    tokenPath: '/oauth2/v4/token',
    authorizeHost: 'https://accounts.google.com',
    authorizePath: '/o/oauth2/auth'
  }
});

class Auth extends Emitter {
  constructor() {
    super();

    this._server = null;
    this._port = null;

    this._app = express();

    this._app.get('/authorize', (req, res) => {
      res.redirect(oauth2.authorizationCode.authorizeURL({
        redirect_uri: this._redirectURI(),
        scope: 'http://www.google.com/m8/feeds/contacts/',
        state: null
      }));
    });

    this._app.get('/authorize/callback', (req, res) => {
      this._useCode(req.query.code);

      res.status(200)
        .type('text/html; charset=utf-8')
        .send('Please close this page.\n<script>window.close();</script>');
    });

    try {
      this._tokens = JSON.parse(localStorage.tokens);
      this._token = oauth2.accessToken.create(this._tokens);
    } catch (err) {
      this._tokens = null;
      this._token = null;
    }
  }

  start() {
    if (!this._server) {
      this._startServer();
      this._server.once('listening', () => this.start());
    } else {
      nw.Shell.openExternal(`http://localhost:${this._port}/authorize`);
    }
  }

  stop() {
    if (this._server) {
      this._server.close();
      this._server = null;
    }
  }

  getAccessToken() {
    return this._tokens.access_token;
  }

  refresh(callback) {
    this._token.refresh((err, result) => {
      if (err) return callback(err);
      this._token = result;
      this._tokens = this._token.token;
      localStorage.tokens = JSON.stringify(this._tokens);
      callback(null);
    });
  }

  deauthorize() {
    if (!this._token) return;
    this._token.revoke('access_token', () => {
      this._token.revoke('refresh_token', () => {
        this._token = null;
        this._tokens = null;
        delete localStorage.tokens;
        this.emit('deauthorized');
      });
    });
  }

  isAuthorized() {
    return !!this._tokens;
  }

  _startServer() {
    this._server = http.createServer(this._app);
    this._server.listen(() => {
      this._port = this._server.address().port;
    });
  }

  _redirectURI() {
    return `http://localhost:${this._port}/authorize/callback`;
  }

  _useCode(code) {
    oauth2.authorizationCode.getToken({
      code,
      redirect_uri: this._redirectURI()
    }, (err, result) => {
      if (err) {
        this.emit('error', err);
      } else {
        this._tokens = result;
        localStorage.tokens = JSON.stringify(this._tokens);
        this._token = oauth2.accessToken.create(result);
        this.emit('authorized');
      }
    });
  }
}

const auth = new Auth();

module.exports = auth;
