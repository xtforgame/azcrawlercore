import fs from 'fs';
import path from 'path';
import moment from 'moment';
import { google, drive_v3, gmail_v1 } from 'googleapis';
import puppeteer, { launch, Browser } from 'puppeteer';
import useProxy from 'puppeteer-page-proxy';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';
import GoogleOAuth2Client from '~/utils/GoogleOAuth2Client';
import GoogleDriveManager from '~/utils/GoogleDriveManager';
import CrawlerCoreBase from './CrawlerCoreBase';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];


export default class ShoplineCrawlerBase extends CrawlerCoreBase {
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
    return session;
  }

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

