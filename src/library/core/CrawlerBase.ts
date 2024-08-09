import fs from 'fs';
import path from 'path';
import moment from 'moment';
import { google, drive_v3, gmail_v1 } from 'googleapis';
import puppeteer, { launch, Browser, ElementHandle, Page } from 'puppeteer';
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

  getMessages = async (page: Page, memberId: string, query: string) => {
    const p = new Promise<any>((resolve, reject) => {
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
    const p = new Promise<any>((resolve, reject) => {
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

        {

          // const memberFilterBase = '?assignment_filter=all&limit=50&pinned=true&processing_state=resolved';
          // const memberFilterBase = '?assignment_filter=all&limit=50&pinned=false&processing_state=resolved';
          // const memberFilterBase = '?assignment_filter=all&limit=50&pinned=true&processing_state=new';
          const memberFilterBase = '?assignment_filter=all&limit=50&pinned=false&processing_state=resolved';
          const messageFilterBase = '?limit=50';
          const exportFolder = 'chat/export';

          fs.mkdirSync(exportFolder, { recursive: true });
          fs.mkdirSync(`${exportFolder}/members`, { recursive: true });
          fs.mkdirSync(`${exportFolder}/member-map`, { recursive: true });
          fs.mkdirSync(`${exportFolder}/messages`, { recursive: true });
          fs.mkdirSync(`${exportFolder}/message-map`, { recursive: true });

          type ResouceItems = {
            cursor: {
              after: string | null;
            };
            [s: string]: any;
          };
          type FetchFunc<T extends ResouceItems> = (page: Page, cursor?: string) => Promise<T>;
          type CallbackFunc<T extends ResouceItems> = (data: T, page: Page, cursor?: string) => Promise<any>;
          async function forList<T extends ResouceItems>(fetchFunc: FetchFunc<T>, callbackFunc: CallbackFunc<T>, exportListFolderName?: string) {
            let counter = 0;
            let records = await fetchFunc(page);
            if (exportListFolderName) {
              fs.mkdirSync(`${exportFolder}/${exportListFolderName}`, { recursive: true });
              fs.writeFileSync(`${exportFolder}/${exportListFolderName}/list-${counter}.json`, JSON.stringify(records, null, 2));
            }
            await callbackFunc(records, page);
            await promiseWait(500);
            while (records.cursor.after) {
              const nextRecords = await fetchFunc(page, records.cursor.after.replace(/\=/gm, '%3D'));
              if (exportListFolderName) {
                fs.writeFileSync(`${exportFolder}/${exportListFolderName}/list-${counter}.json`, JSON.stringify(records, null, 2));
              }
              await callbackFunc(records, page, records.cursor.after.replace(/\=/gm, '%3D'));
              records = nextRecords;
              await promiseWait(500);
            }
          }
          /// =========
          const page = await this.newPage(browser);
          await page.setExtraHTTPHeaders({
            "authorization": authorization,
          });
          await forList(async (page, cursor) => {
            if (cursor) {
              return this.getMembers(page, `${memberFilterBase}&cursor=${cursor}`)
            } else {
              return this.getMembers(page, memberFilterBase)
            }
          }, async (members) => {
            await promiseReduce((members?.members || []), async (_, member: any) => {
              const memberFilePath = `${exportFolder}/member-map/${member.id}.json`;
              try {
                const file = JSON.parse(fs.readFileSync(memberFilePath, { encoding: 'utf-8' }));
                if (file && file.updated_at === member.updated_at) {
                  return;
                }
              } catch (error) {
              }
              let allMessage: any[] = [];
              await forList(async (page, cursor) => {
                if (cursor) {
                  return this.getMessages(page, member.id, `${messageFilterBase}&cursor=${cursor}`)
                } else {
                  return this.getMessages(page, member.id, messageFilterBase)
                }
              }, async (messages) => {
                allMessage = [...allMessage, ...(messages?.messages || [])];
              });
              const messageFilePath = `${exportFolder}/message-map/${member.id}.json`;
              // fs.writeFileSync(messageFilePath, JSON.stringify(allMessage, null, 2));
              member.messages = allMessage;
              fs.writeFileSync(memberFilePath, JSON.stringify(member, null, 2));
            }, null);
          }, 'members');
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

