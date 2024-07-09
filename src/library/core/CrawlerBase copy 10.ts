import fs from 'fs';
import path from 'path';
import moment from 'moment';
import OpenAI from 'openai';
import { google, drive_v3, gmail_v1 } from 'googleapis';
import puppeteer, { launch, Browser, ElementHandle, Page } from 'puppeteer';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';
import { scanAndSyncCodePages, updateCodeFromJson, updateCode, fetchCodePage, listCodePages, loadCodePage, saveCodePage } from '~/core/editorutils';
import ShoplineCrawlerBase from './ShoplineCrawlerBase';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];

process.env.OPENAI_API_KEY = '.....';

const openai = new OpenAI();

type CompletionData = {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  // completion: OpenAI.Chat.Completions.ChatCompletion,
};

type ReplyOptions = {
  userId?: any;
  systemMessages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}

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
        await page.goto('https://google.com', {
          waitUntil: 'networkidle2',
        });
        const session = await page.target().createCDPSession();
        await session.send('Page.enable');
        // await page.$eval('input[data-qa-id=loginUserName]', ($input) => {
        //   ($input as HTMLInputElement).value = 'rick.chen@studiodoe.com';
        //   const event = new Event('change');
        //   $input.dispatchEvent(event);
        // });

        const urls: any = {};

        const p = new Promise((resolve, reject) => {
          const cb = (resp) => {
            const url = resp.url();
            const contentType = resp.headers()['content-type'];
            if (contentType.includes('application/json')) {
              resp.json()
              .then(j => urls[url] = j);
            }
            // urls[url] = resp.headers()['content-type'];
            // console.log('resp.headers :', resp.headers());
            // console.log('url :', url);
            if (url.includes('xxxxxxxxxx')) {
              if (resp.status() === 200) {
                resolve(resp.json());
              } else {
                reject(resp.json());
              }
              page.off('response', cb);
            }
          }
          page.on('response', cb);
        });
        await page.goto(`https://www.instagram.com/p/C70htPASygx`, {
          waitUntil: 'networkidle2',
        });
        setTimeout(() => {
          fs.writeFileSync('igurls.json', JSON.stringify(urls, null, 2));
        }, 10000);
        await p;
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

