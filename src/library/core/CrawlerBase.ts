import fs from 'fs';
import path from 'path';
import moment from 'moment';
import { google, drive_v3, gmail_v1 } from 'googleapis';
import puppeteer, { Handler, HTTPResponse, launch, Browser, ElementHandle, Page } from 'puppeteer';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';
import { scanAndSyncCodePages, updateCodeFromJson, updateCode, fetchCodePage, listCodePages, loadCodePage, saveCodePage } from '~/core/editorutils';
import ShoplineCrawlerBase from './ShoplineCrawlerBase';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];

const folderBase = 'chat/export2';

export default class CrawlerBase extends ShoplineCrawlerBase {
  pageCounter = 0;
  async init() {
    this.gmailApis = await Promise.all([
      await this.createGmailApi('googleapp_tokens-xt.json'),
      await this.createGmailApi('googleapp_tokens-bsd.json'),
      // await this.createDriveApi('googleapp_tokens-c2.json'),
    ]);
    fs.mkdirSync(`${folderBase}/member-map`, { recursive: true })
  }

  getMemberFromFile(memberId: string) {
    try {
      return JSON.parse(fs.readFileSync(`${folderBase}/member-map/${memberId}.json`, { encoding: 'utf-8' }));
    } catch (error) {
      return null
    }
  }

  fetchMessagesCore = async (page: Page, authorization: string, baseUrl: string, cursor: string = '') => {
    const url = `${baseUrl}${cursor ? `&cursor=${cursor}` : ''}`;
    const p = new Promise<{ messages: any[], cursor: { after: null | string } }>((resolve, reject) => {
      const cb = (resp) => {
        const url = resp.url();
        // console.log('url :', url);
        if (url.includes(url)) {
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
    await page.setExtraHTTPHeaders({
      authorization,
    })
    await page.goto(url, {
      waitUntil: 'networkidle2',
    });
    const result = await p;
    return result;
  };

  fetchMessages = async (page: Page, authorization: string, memberId: string) => {
    const url = `https://api.caac.cresclab.com/api/v1/orgs/1612/chat/members/${memberId}/messages?limit=100`
    const result = await this.fetchMessagesCore(page, authorization, url);
    let result2 = result;
    while(result2?.cursor?.after) {
      result2 = await this.fetchMessagesCore(page, authorization, url, result2?.cursor?.after);
      result.messages.push(...result2.messages);
    }
    return result;
  };

  fetchMemberCore = async (page: Page, authorization: string, memberId: string) => {
    const url = `https://api.caac.cresclab.com/api/v1/orgs/1612/chat/members/${memberId}`;
    const p = new Promise<{ members: any[], cursor: { after: null | string } }>((resolve, reject) => {
      const cb = (resp) => {
        const url = resp.url();
        // console.log('url :', url);
        if (url.includes(url)) {
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
    await page.setExtraHTTPHeaders({
      authorization,
    })
    await page.goto(url, {
      waitUntil: 'networkidle2',
    });
    const result = await p;
    return result;
  };

  fetchMembersCore = async (page: Page, authorization: string, baseUrl: string, cursor: string = '') => {
    const url = `${baseUrl}${cursor ? `&cursor=${cursor}` : ''}`;
    const p = new Promise<{ members: any[], cursor: { after: null | string }  }>((resolve, reject) => {
      const cb = (resp) => {
        const url = resp.url();
        // console.log('url :', url);
        if (url.includes(url)) {
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
    await page.setExtraHTTPHeaders({
      authorization,
    })
    await page.goto(url, {
      waitUntil: 'networkidle2',
    });
    const result = await p;
    return result;
  };

  fetchMembers = async (page: Page, authorization: string, url: string, cursor: string = '') => {
    const result = await this.fetchMembersCore(page, authorization, url);
    const handleMembers = async (members: any[]) => {
      this.pageCounter++;
      console.log('handleMembers :', this.pageCounter);
      await promiseReduce(result.members, async(_, member) => {
        const memberFromFile = this.getMemberFromFile(member.id);
        if (memberFromFile && moment(memberFromFile.updated_at).valueOf() >= moment(member.updated_at).valueOf()) {
          return;
        }
        const memberEx = await this.fetchMemberCore(page, authorization, member.id);
        (memberEx as any).messages = await this.fetchMessages(page, authorization, member.id);
        fs.writeFileSync(`${folderBase}/member-map/${member.id}.json`, JSON.stringify(memberEx, null, 2));
      }, null);
    }
    let result2 = result;
    await handleMembers(result2.members);
    while(result2?.cursor?.after) {
      result2 = await this.fetchMembersCore(page, authorization, url, result2?.cursor?.after);
      await handleMembers(result2.members);
      result.members.push(...result2.members);
    }
    return result;
  };

  async runX() {
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(true));
    try {
      if (1 == 1) {
        const page = await this.newPage(browser);
        await page.goto(`https://caac.cresclab.com/login`, {
          waitUntil: 'networkidle2',
        });
        const session = await page.target().createCDPSession();
        await session.send('Page.enable');

        const p = new Promise<string>((resolve, reject) => {
          const cb: Handler<HTTPResponse> = (resp) => {
            const url = resp.url();
            const authorization = resp.request().headers().authorization;

            if (authorization) {
              resolve(authorization);
              page.off('response', cb);
            }
          }
          page.on('response', cb);
        });

        await page.type('#email', 'it@studiodoe.com');
        await page.type('#password', 'g!g@*kizrb=ez#u8');
        // await page.$eval('#email', $input => ($input as HTMLInputElement).value = 'it@studiodoe.com');
        // await page.$eval('#password', $input => ($input as HTMLInputElement).value = 'g!g@*kizrb=ez#u8');
        await page.click('button[data-test=login-action-submit]');

        await promiseWait(3000);

        const authorization = await p;
        console.log('authorization :', authorization);

        const page2 = await this.newPage(browser);
        const x1 = await this.fetchMembers(page2, authorization, 'https://api.caac.cresclab.com/api/v2/orgs/1612/chat/members?assignment_filter=all&limit=100&pinned=true&processing_state=new');
        const x2 = await this.fetchMembers(page2, authorization, 'https://api.caac.cresclab.com/api/v2/orgs/1612/chat/members?assignment_filter=all&limit=100&pinned=false&processing_state=new');
        const x3 = await this.fetchMembers(page2, authorization, 'https://api.caac.cresclab.com/api/v2/orgs/1612/chat/members?assignment_filter=all&limit=100&pinned=true&processing_state=resolved');
        const x4 = await this.fetchMembers(page2, authorization, 'https://api.caac.cresclab.com/api/v2/orgs/1612/chat/members?assignment_filter=all&limit=100&pinned=false&processing_state=resolved');
        console.log('x1, x2, x3, x4 :', x1, x2, x3, x4);

        await promiseWait(9999999);
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

