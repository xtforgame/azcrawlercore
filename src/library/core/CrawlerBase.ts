import fs from 'fs';
import path from 'path';
import moment from 'moment';
import { google, drive_v3, gmail_v1 } from 'googleapis';
import puppeteer, { launch, Browser } from 'puppeteer';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';
import { scanAndSyncCodePages, updateCodeFromJson, updateCode, fetchCodePage, listCodePages, loadCodePage, saveCodePage } from '~/core/editorutils';
import ShoplineCrawlerBase from './ShoplineCrawlerBase';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];


export default class CrawlerBase extends ShoplineCrawlerBase {
  async init() {
    this.gmailApis = await Promise.all([
      await this.createGmailApi('googleapp_tokens-xt.json'),
      await this.createGmailApi('googleapp_tokens-bsd.json'),
      // await this.createDriveApi('googleapp_tokens-c2.json'),
    ]);
  }

  async runX() {
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(true));
    try {
      if (1 == 1) {
        const page = await this.newPage(browser);
        await page.goto('https://console.appier.com', {
          waitUntil: 'networkidle2',
        });
        const session = await page.target().createCDPSession();
        await session.send('Page.enable');
        // await page.$eval('input[data-qa-id=loginUserName]', ($input) => {
        //   ($input as HTMLInputElement).value = 'rick.chen@studiodoe.com';
        //   const event = new Event('change');
        //   $input.dispatchEvent(event);
        // });
        await page.type('#username', 'rick.chen@studiodoe.com', {
          delay: 20,
        });
        await page.type('#password', '1qqw1qqw', {
          delay: 20,
        });
        await page.click('button[name=action][type=submit]');

        await promiseWaitFor(2000, async () => {
          return !page.url().startsWith('https://auth.appier.com');
        });

        await page.goto('https://console.appier.com/project/project-h039bmWso/flows', {
          waitUntil: 'networkidle2',
        });
        
        await promiseWait(200000);
      }
      console.log('done');
    } catch (error) {
      console.log('error :', error);
    }

    // await promiseWait(9999999);
    await browser.close();
  }

  async run() {
    await this.init();
    await this.runX();
    return 1;
  }
}

