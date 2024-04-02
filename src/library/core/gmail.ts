// yarn add googleapis@105 @google-cloud/local-auth@2.1.0
import { google, gmail_v1 } from 'googleapis';
import moment from 'moment';

const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');


// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * Load or request or authorization to call APIs.
 *
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listLabels(auth) {
  const gmail = google.gmail({ version: 'v1', auth });
  const res = await gmail.users.labels.list({
    userId: 'me',
  });
  const { labels } = res.data;
  if (!labels || labels.length === 0) {
    console.log('No labels found.');
    return;
  }
  console.log('Labels:');
  labels.forEach((label) => {
    console.log(`- ${label.name}`);
  });
}

export const listMails = async (gmail: gmail_v1.Gmail) => {
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
    });
    return response.data.messages;
  } catch (error) {
    console.error('The API returned an error:', error);
    return [];
  }
};

// 获取邮件内容
export const getMessage = async (gmail: gmail_v1.Gmail, messageId: string) => {
  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
    });
    return response.data;
  } catch (error) {
    console.error('The API returned an error:', error);
    return null;
  }
};

export const run = async (timeMs: number) => {
  const auth = await authorize();
  const gmail = google.gmail({ version: 'v1', auth });
  const mails = await listMails(gmail);
  console.log('mails :', mails);
  if (mails && mails.length > 0) {
    const messageId = mails[0].id;
    const message = await getMessage(gmail, messageId);
    const dateMs = parseInt(message?.internalDate || '0');
    if (moment(dateMs).valueOf() > moment(timeMs).valueOf()) {
      console.log('First message:', message?.snippet);
    }
  } else {
    console.log('No messages found.');
  }
  // await listLabels(auth);
  return true;
};
