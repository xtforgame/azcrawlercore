/* eslint-disable no-console, no-underscore-dangle */
import { google, GoogleApis } from 'googleapis';
import { Compute, GoogleAuth, JWT, OAuth2Client } from 'google-auth-library';

export default class GoogleOAuth2Client {
  name: string;

  scopes: string[];

  config: any;

  clientSecrets: any;

  oAuth2Client: OAuth2Client;

  authorized: boolean;

  constructor(name, config) {
    this.name = name;
    this.config = config;
    ({
      scopes: this.scopes = [],
      clientSecrets: this.clientSecrets,
    } = this.config);
    const { client_secret, client_id, redirect_uris } = this.clientSecrets;
    this.oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]
    );
    this.authorized = false;
  }

  /**
   * Create an OAuth2 client with the given credentials, and then execute the
   * given callback function.
   * @param {Object} credentials The authorization client credentials.
   */
  async authorize(token) {
    this.oAuth2Client.setCredentials(token);
    this.authorized = true;
    return this.oAuth2Client;
  }

  async authorizeByCode(code, saver) {
    const { tokens } = await this.oAuth2Client.getToken(code);
    console.log('tokens :', tokens);
    this.oAuth2Client.setCredentials(tokens);
    this.authorized = true;
    await Promise.resolve(saver(tokens));
    return this.oAuth2Client;
  }

  generateAuthUrl() {
    return this.oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.scopes,
    });
  }
}
