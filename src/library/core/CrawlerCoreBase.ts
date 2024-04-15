import fs from 'fs';
import path from 'path';
import moment from 'moment';
import { google, drive_v3, gmail_v1 } from 'googleapis';
import puppeteer, { launch, Browser } from 'puppeteer';
import useProxy from 'puppeteer-page-proxy';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';
import GoogleOAuth2Client from '~/utils/GoogleOAuth2Client';
import GoogleDriveManager from '~/utils/GoogleDriveManager';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];


export default class CrawlerCoreBase {
  gmailApis: gmail_v1.Gmail[];

  driveApis: drive_v3.Drive[];

  constructor() {
    this.gmailApis = [];
    this.driveApis = [];
  }

  async loadJsonFile(filepath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filepath, (err, content) => {
        if (err) {
          return reject(new Error(`Error loading client secret file: ${err}`));
        }
        try {
          return resolve(JSON.parse(content.toString('utf-8')));
        } catch (e) {
          return reject(e);
        }
      });
    });
  }

  async createGmailApi(tokenName: string) {
    const clientSecrets : any = await this.loadJsonFile(path.join('secrets', 'googleapp_client_secrets_gmail.json'));
    const goa2c = new GoogleOAuth2Client(
      'calendarManager',
      {
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
        ],
        clientSecrets: clientSecrets.installed,
      }
    );
    const tokens = await this.loadJsonFile(path.join('secrets', tokenName));
    goa2c.authorize(tokens);
    return google.gmail({ version: 'v1', auth: goa2c.oAuth2Client });
  }

  getPuppeteerLaunchOptions(debug : boolean = false) : PuppeteerLaunchOptions {
    const args = [
      `--window-size=1920,1080`,
    ];
    const options : PuppeteerLaunchOptions = debug ? {
      devtools: true,
      headless: false,
      slowMo: 100,
      args,
    } : {
      headless: true,
      args,
    };
    if (process.env.IN_DOCKER) {
      return {
        ...options,
        executablePath: '/usr/bin/chromium-browser',
        args: [
          // Required for Docker version of Puppeteer
          '--no-sandbox',
          '--disable-setuid-sandbox',
          // This will write shared memory files into /tmp instead of /dev/shm,
          // because Docker’s default for /dev/shm is 64MB
          '--disable-dev-shm-usage',
  
          '--disable-gpu',
          '--single-process',
          '--disable-web-security',
          '--disable-dev-profile',
          ...(options.args || []),
        ],
      };
    }
    return options;
  }

  async newPage(browser: Browser, url: string = '') {
    const page = await browser.newPage();
    await page.setViewport({
      width: 1920,
      height: 1080,
    });
    if (url) {
      await page.goto(url, {
        waitUntil: 'networkidle2',
      });
    }
    return page;
  }

  async listMails(gmail: gmail_v1.Gmail) {
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
  async getMessage(gmail: gmail_v1.Gmail, messageId: string) {
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

}

