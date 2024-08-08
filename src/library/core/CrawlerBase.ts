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

  getMessages = async (page: Page, memberId: string, query: string) => {
    const p = new Promise<string>((resolve, reject) => {
      const cb = (resp) => {
        const url = resp.url();
        const contentType = resp.headers()['content-type'];
        if (resp.request().method().toUpperCase() === 'OPTION') {
          return;
        }
        if (contentType && contentType.includes('application/json')) {
          if (url.includes('/messages?')) {
            if (resp.status() === 200) {
              resolve(resp.json());
            } else {
              reject(null);
            }
            page.off('response', cb);
          }
        }
        // urls[url] = resp.headers()['content-type'];
        // console.log('resp.headers :', resp.headers());
        // console.log('url :', url);
      }
      page.on('response', cb);
    });
    await page.goto(`https://api.caac.cresclab.com/api/v1/orgs/1612/chat/members/${memberId}/messages${query}`, {
      waitUntil: 'networkidle2',
    });
    return p;
  };

  getMembers = async (page: Page, query: string) => {
    const p = new Promise<string>((resolve, reject) => {
      const cb = (resp) => {
        const url = resp.url();
        const contentType = resp.headers()['content-type'];
        if (resp.request().method().toUpperCase() === 'OPTION') {
          return;
        }
        if (contentType && contentType.includes('application/json')) {
          if (url.includes('/members?')) {
            if (resp.status() === 200) {
              resolve(resp.json());
            } else {
              reject(null);
            }
            page.off('response', cb);
          }
        }
        // urls[url] = resp.headers()['content-type'];
        // console.log('resp.headers :', resp.headers());
        // console.log('url :', url);
      }
      page.on('response', cb);
    });
    await page.goto(`https://api.caac.cresclab.com/api/v2/orgs/1612/chat/members${query}`, {
      waitUntil: 'networkidle2',
    });
    return p;
  };

  async runX() {
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(true));
    try {
      if (1 == 1) {
        const page = await this.newPage(browser);
        await page.goto('https://caac.cresclab.com/login?redirect=%2Fchat', {
          waitUntil: 'networkidle2',
        });
        const session = await page.target().createCDPSession();
        await session.send('Page.enable');
        // await page.$eval('input[data-qa-id=loginUserName]', ($input) => {
        //   ($input as HTMLInputElement).value = 'rick.chen@studiodoe.com';
        //   const event = new Event('change');
        //   $input.dispatchEvent(event);
        // });


        await promiseWaitFor(1000, async () => {
          await page.type('#email', 'it@studiodoe.com', {
            delay: 20,
          });
          await page.type('#password', 'g!g@*kizrb=ez#u8', {
            delay: 20,
          });
          await page.click('button[data-test=login-action-submit][type=submit]');
          return true;
        });

        const p = new Promise<string>((resolve, reject) => {
          const cb = (resp) => {
            const url = resp.url();
            const contentType = resp.headers()['content-type'];
            if (resp.request().method().toUpperCase() === 'OPTION') {
              return;
            }
            if (contentType && contentType.includes('application/json')) {
              if (url.includes('/members?')) {
                if (resp.status() === 200) {
                  resolve(resp.request().headers().authorization);
                } else {
                  reject(resp.request().headers().authorization);
                }
                page.off('response', cb);
              }
            }
            // urls[url] = resp.headers()['content-type'];
            // console.log('resp.headers :', resp.headers());
            // console.log('url :', url);
            
          }
          page.on('response', cb);
        });
        const authorization = await p;
        console.log('authorization :', authorization);

        await promiseWait(2000);

        // const memberFilterBase = '?assignment_filter=all&limit=50&pinned=true&processing_state=resolved';
        // const memberFilterBase = '?assignment_filter=all&limit=50&pinned=false&processing_state=resolved';
        // const memberFilterBase = '?assignment_filter=all&limit=50&pinned=true&processing_state=new';
        const memberFilterBase = '?assignment_filter=all&limit=50&pinned=false&processing_state=resolved';


        const messageFilterBase = '?limit=50';


        {
          const page = await this.newPage(browser);
          await page.setExtraHTTPHeaders({
            "authorization": authorization,
          });
          let counter = 0;
          let members: any = await this.getMembers(page, memberFilterBase);
          if (members?.cursor?.after) {
            fs.writeFileSync(`x-${counter}.json`, JSON.stringify(members, null, 2));
            if (members?.members?.[0]) {
              let messages: any = await this.getMessages(page, members?.members?.[0].id, `${messageFilterBase}`);
              console.log('messages :', messages);
            }
            await promiseWait(1000);
            ++counter;
            console.log('counter :', counter);
            members = await this.getMembers(page, `${memberFilterBase}&cursor=${members?.cursor?.after.replace(/\=/gm, '%3D')}`);
            console.log('d :', members?.cursor?.after);
          }
          page.close();
        }

        // await promiseWaitFor(1000, async () => {
        //   return !page.url().startsWith('https://auth.appier.com');
        // });

        // await page.goto('https://console.appier.com/project/project-h039bmWso/flows', {
        //   waitUntil: 'networkidle2',
        // });

        // await promiseWait(2000);

        // await promiseWaitFor(1000, async () => {
        //   const $spans = await page.$$('div#side-panel-parent > div > div > div span');
        //   const spanNames = await page.$$eval('div#side-panel-parent > div > div > div span', ($spans) => {
        //     return Array.from($spans).map(e => (e.textContent || '').trim());
        //   });
  
        //   const i = spanNames.indexOf('即時訊息');
        //   await $spans[i].click();

        //   // console.log('spanNames :', spanNames);
        //   return true;
        // });

        // await promiseReduce(Array.from($spans), async (_, $span, i) => {
        //   await $span.click();
        // }, null);
        
        await promiseWait(20000000);
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

