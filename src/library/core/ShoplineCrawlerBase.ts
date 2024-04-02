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


export default class ShoplineCrawlerBase {
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
      slowMo: 250,
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

  async login(page: puppeteer.Page) {
    await page.goto('https://sso.shoplineapp.com/users/sign_in', {
      waitUntil: 'networkidle2',
    });
    const session = await page.target().createCDPSession();
    await session.send('Page.enable');
    // await page.screenshot({ path: 'example.png' });
    await page.$eval('#staff_email', $input => ($input as HTMLInputElement).value = 'xtforgame@gmail.com');
    await page.$eval('#staff_password', $input => ($input as HTMLInputElement).value = 'qqwqqwqqw');
    await page.click('#new_staff button[name=button]');
    const timeMs = new Date().getTime();
    await promiseWait(2000);
    let code = '';
    await promiseWaitFor(5000, async () => {
      const c = await this.getCode(timeMs);
      if (c) {
        code = c;
      }
      return !!c;
    });
    console.log('code :', code);
    await page.$eval('#code[name=code]', ($input, c: any) => ($input as HTMLInputElement).value = c, code);
    await page.click('input[name=commit]');
    await promiseWaitFor(2000, async () => (page.url() !== 'https://sso.shoplineapp.com/users/two_factor_authentication')
      && (page.url() !== 'https://sso.shoplineapp.com/users/sign_in'));
  }

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

  async getCode(timeMs: number) {
    const gmail = this.gmailApis[0];
    const mails = await this.listMails(gmail);
    // console.log('mails :', mails);
    if (mails && mails.length > 0) {
      let code = '';
      try {
        await promiseReduce(mails, async (_, mail) => {
          if (code) {
            throw new Error('done');
          }
          const messageId = mail.id as string;
          const message = await this.getMessage(gmail, messageId);
          const dateMs = parseInt(message?.internalDate || '0');
          // console.log('dateMs, timeMs :', dateMs, timeMs);
          if (moment(timeMs).valueOf() - moment(dateMs).valueOf() < 1000) {
            // console.log('First message:', message?.snippet);
            const r = /\:\s([0-9]{6})\s/gm.exec(message?.snippet || '');
            if (r?.[1]) {
              // console.log('First message:', message?.snippet);
              code = r?.[1];
            }
          } else {
            throw new Error('no mail');
          }
        }, null);
      } catch (error: any) {
        if (error.message === 'no mail') {

        }
      }
      // console.log('code :', code);
      return code;
    } else {
      console.log('No messages found.');
    }
    return null;
  };
}

