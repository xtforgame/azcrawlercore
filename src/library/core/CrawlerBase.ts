import fs from 'fs';
import path from 'path';
import querystring from 'querystring';
import moment from 'moment';
import { google, drive_v3, gmail_v1 } from 'googleapis';
import puppeteer, { launch, Browser } from 'puppeteer';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';
import { scanAndSyncCodePages, updateCodeFromJson, updateCode, fetchCodePage, listCodePages, loadCodePage, saveCodePage } from '~/core/editorutils';
import CrawlerCoreBase from './CrawlerCoreBase';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];


export default class CrawlerBase extends CrawlerCoreBase {
  async init() {
    this.gmailApis = await Promise.all([
      await this.createGmailApi('googleapp_tokens-studiodoe.json'),
      // await this.createDriveApi('googleapp_tokens-c2.json'),
    ]);
  }

  async login(page: puppeteer.Page) {
    await page.goto('https://bsignin.104.com.tw/login', {
      waitUntil: 'networkidle2',
    });
    const session = await page.target().createCDPSession();
    await session.send('Page.enable');
    // await page.$eval('input[data-qa-id=loginUserName]', ($input) => {
    //   ($input as HTMLInputElement).value = 'rick.chen@studiodoe.com';
    //   const event = new Event('change');
    //   $input.dispatchEvent(event);
    // });
    await page.type('input[data-qa-id=loginUserName]', 'rick.chen@studiodoe.com', {
      delay: 100,
    });
    await page.type('input[data-qa-id=loginPassword]', '1qqppaall', {
      delay: 100,
    });
    await page.click('button[data-qa-id=loginButton]');
    const timeMs = new Date().getTime();
    await promiseWait(1000);
    let code = '';
    await promiseWaitFor(5000, async () => {
      const c = await this.getCode(timeMs);
      if (c) {
        code = c;
      }
      return !!c;
    });
    console.log('code :', code);
    await page.type('input[placeholder=請輸入6碼驗證碼]', code, {
      delay: 100,
    });
    await page.click('.pb-24 > button');
    await promiseWaitFor(2000, async () => page.url() === 'https://bsignin.104.com.tw/product');

    await page.goto('https://vip.104.com.tw', {
      waitUntil: 'networkidle2',
    });

    if (page.url().startsWith('https://vip.104.com.tw/company/status/repeatLogin')) {
      await page.click('.repeat-login-block__btn-group > button:nth-of-type(2)');
    }

    await promiseWaitFor(2000, async () => page.url() === 'https://vip.104.com.tw/index/index');
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
            console.log('First message:', message?.snippet);
            const r = /您的OTP驗證碼為：\s([0-9]{6})\s/gm.exec(message?.snippet || '');
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

  fetchResume = async (page: puppeteer.Page, id: string) => {
    const p = new Promise((resolve, reject) => {
      const cb = (resp) => {
        const url = resp.url();
        // console.log('url :', url);
        if (url.includes(`https://auth.vip.104.com.tw/vipapi/resume/search/${id}`)) {
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
    await page.goto(`https://auth.vip.104.com.tw/vipapi/resume/search/${id}`, {
      waitUntil: 'networkidle2',
    });
    const result = await p;
    return result;
  };

  fetchResumePic = async (page: puppeteer.Page, picUrl: string) => {
    const p = new Promise((resolve, reject) => {
      const cb = (resp) => {
        const url = resp.url();
        // console.log('url :', url);
        if (url.includes(picUrl)) {
          if (resp.status() === 200) {
            resp.buffer().then(file => {
                const fileName = url.split('/').pop();
                const filePath = path.resolve(__dirname, fileName);
                const writeStream = fs.createWriteStream(filePath);
                writeStream.write(file);
                resolve('');
            });
          } else {
            reject('');
          }
          page.off('response', cb);
        }

        // if (resp.request().resourceType() === 'image') {
        //   resp.buffer().then(file => {
        //       const fileName = url.split('/').pop();
        //       const filePath = path.resolve(__dirname, fileName);
        //       const writeStream = fs.createWriteStream(filePath);
        //       writeStream.write(file);
        //   });
        // }
      }
      page.on('response', cb);
    });
    await page.goto(picUrl, {
      waitUntil: 'networkidle2',
    });
    const result = await p;
    return result;
  };

  fetchResumeList = async (browser: puppeteer.Browser, baseUrl: string, pageNum: number = 0) => {
    let url = baseUrl;
    const urlParts = baseUrl.split('?')
    const queryString = urlParts[urlParts.length - 1];
    const query = querystring.decode(queryString);
    if (query.page != null) {
      delete query.page;
    }
    if (pageNum) {
      query.page = `${pageNum}`;
    }
    url = `${urlParts[0]}?${querystring.encode(query)}`;
    console.log('url :', url);
    const page = await this.newPage(browser);
    const p = new Promise((resolve, reject) => {
      const cb = (resp) => {
        const url = resp.url();
        // console.log('url :', url);
        const method = resp.request().method();
        if (method !== 'OPTIONS' && url.includes(`https://auth.vip.104.com.tw/api/search/searchResult`)) {
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
    await page.goto(url, {
      waitUntil: 'networkidle2',
    });
    const result = await p;
    await page.close();
    return result;
  };

  async runX() {
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(true));
    try {
      if (1 == 1) {
        const page = await this.newPage(browser);
        await this.login(page);

        const json2: any = await this.fetchResumeList(browser, `https://vip.104.com.tw/search/searchResult?kws=%E8%A8%AD%E8%A8%88%E5%B8%AB&plastActionDateType=5&updateDateType=4&contactInfo=0&jobcat=2013001005,2013001015,2013001016,2013001006&city=6001001000&home=6001001000,6001002000&workExpTimeType=all&workExpTimeMin=1&workExpTimeMax=1&edu%5B%5D=2&edu%5B%5D=4&edu%5B%5D=8&edu%5B%5D=16&edu%5B%5D=32&role%5B%5D=1&sex=2&empStatus=0&sortType=RANK&page=2`);
        console.log('json2 :', json2.result.data.map(row => row.idNo));

        const page2 = await this.newPage(browser);
        const personalPicTmpPath = 'exports/downloaded-personal-pics';
        const personalPicPath = 'exports/personal-pics';
        const resumePath = 'exports/resume';
        fs.mkdirSync(personalPicTmpPath, { recursive: true });
        fs.mkdirSync(personalPicPath, { recursive: true });
        fs.mkdirSync(resumePath, { recursive: true });
        await page2._client.send('Page.setDownloadBehavior', {
          behavior: 'allow',
          downloadPath: personalPicTmpPath,
        });
        await promiseReduce(json2.result.data, async (_, row: any) => {
          const json: any = await this.fetchResume(page2, row.idNo);
          if (json?.data?.resume?.personalPic) {
            const waitImg = async () => {
              const files = fs.readdirSync(personalPicTmpPath);
              for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (file !== '.DS_Store' && !file.includes('.crdownload')) {
                  const extname = path.extname(file);
                  const stats = fs.statSync(path.join(personalPicTmpPath, file))
                  if (!stats.size) {
                    return false;
                  }
                  fs.renameSync(path.join(personalPicTmpPath, file), path.join(personalPicPath, `${row.idNo}${extname}`));
                  return true;
                }
              }
              return false;
            };
            try {
              const noPhoto = 'photo-resume-no-photo.png';
              if (json?.data?.resume?.personalPic.includes(noPhoto)) {
                console.log('json?.data?.resume?.personalPic :', json?.data?.resume?.personalPic);
                // console.log('json :', json);
                const cb = (resp) => {
                  const url = resp.url();
                  console.log('url :', url);
                  if (url.includes(noPhoto)) {
                    console.log('url.includes(noPhoto)');
                    resp.buffer().then(file => {
                      const filePath = path.resolve(personalPicTmpPath, noPhoto);
                      console.log('filePath :', filePath);
                      const writeStream = fs.createWriteStream(filePath);
                      writeStream.write(file);
                    });
                    page2.off('response', cb);
                  }
                }
                page2.on('response', cb);
                await page2.goto(json?.data?.resume?.personalPic, {
                  waitUntil: 'networkidle2',
                });
              } else {
                await page2._client.send('Page.navigate', {
                  url: json?.data?.resume?.personalPic,
                })
              }

              await promiseWaitFor(100, waitImg);
            } catch (error) {
              console.log('error :', error);
            }
          }
          
          fs.writeFileSync(`${resumePath}/${row.idNo}.json`, JSON.stringify(json, null, 2), { encoding: 'utf-8' });
        }, null);
        await page2.close();

        await promiseWait(1000000);
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



// fetch("https://auth.vip.104.com.tw/api/apply/applyResume?sn=691635639&in=30000002957008&ec=4", {
//   "headers": {
//     "accept": "*/*",
//     "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
//     "content-type": "application/json",
//     "referrer": "https://vip.104.com.tw/apply/ApplyResume",
//     "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"92\"",
//     "sec-ch-ua-mobile": "?0",
//     "sec-fetch-dest": "empty",
//     "sec-fetch-mode": "cors",
//     "sec-fetch-site": "same-site",
//     "x-requested-with": "XMLHttpRequest"
//   },
//   "referrer": "https://vip.104.com.tw/",
//   "referrerPolicy": "strict-origin-when-cross-origin",
//   "body": null,
//   "method": "GET",
//   "mode": "cors",
//   "credentials": "include"
// });


// https://vip.104.com.tw/search/searchResult?loadTime=2024-04-15%2015%3A24%3A29&ec=1&kws=%E8%A8%AD%E8%A8%88%E5%B8%AB&jobcat=2013001005,2013001015,2013001016,2013001006&city=6001001000&home=6001001000,6001002000&plastActionDateType=5&workExpTimeType=all&workExpTimeMin=1&workExpTimeMax=1&edu%5B%5D=2&edu%5B%5D=4&edu%5B%5D=8&edu%5B%5D=16&edu%5B%5D=32&role%5B%5D=1&sex=2&empStatus=0&updateDateType=4&contactInfo=0&sortType=RANK
// fetch("https://auth.vip.104.com.tw/api/search/searchResult?loadTime=2024-04-15%2015%3A24%3A29&ec=1&kws=%E8%A8%AD%E8%A8%88%E5%B8%AB&jobcat=2013001005%2C2013001015%2C2013001016%2C2013001006&city=6001001000&home=6001001000%2C6001002000&plastActionDateType=5&workExpTimeType=all&workExpTimeMin=1&workExpTimeMax=1&edu%5B%5D=2&edu%5B%5D=4&edu%5B%5D=8&edu%5B%5D=16&edu%5B%5D=32&role%5B%5D=1&sex=2&empStatus=0&updateDateType=4&contactInfo=0&sortType=RANK", {
//   "headers": {
//     "accept": "*/*",
//     "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
//     "content-type": "application/json",
//     "referrer": "https://vip.104.com.tw/search/searchResult",
//     "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"92\"",
//     "sec-ch-ua-mobile": "?0",
//     "sec-fetch-dest": "empty",
//     "sec-fetch-mode": "cors",
//     "sec-fetch-site": "same-site",
//     "x-requested-with": "XMLHttpRequest"
//   },
//   "referrer": "https://vip.104.com.tw/",
//   "referrerPolicy": "strict-origin-when-cross-origin",
//   "body": null,
//   "method": "GET",
//   "mode": "cors",
//   "credentials": "include"
// });

// https://vip.104.com.tw/search/searchResult?kws=%E8%A8%AD%E8%A8%88%E5%B8%AB&plastActionDateType=5&updateDateType=4&contactInfo=0&jobcat=2013001005,2013001015,2013001016,2013001006&city=6001001000&home=6001001000,6001002000&workExpTimeType=all&workExpTimeMin=1&workExpTimeMax=1&edu%5B%5D=2&edu%5B%5D=4&edu%5B%5D=8&edu%5B%5D=16&edu%5B%5D=32&role%5B%5D=1&sex=2&empStatus=0&sortType=RANK&page=2
// fetch("https://auth.vip.104.com.tw/api/search/searchResult?kws=%E8%A8%AD%E8%A8%88%E5%B8%AB&plastActionDateType=5&updateDateType=4&contactInfo=0&jobcat=2013001005%2C2013001015%2C2013001016%2C2013001006&city=6001001000&home=6001001000%2C6001002000&workExpTimeType=all&workExpTimeMin=1&workExpTimeMax=1&edu%5B%5D=2&edu%5B%5D=4&edu%5B%5D=8&edu%5B%5D=16&edu%5B%5D=32&role%5B%5D=1&sex=2&empStatus=0&sortType=RANK&page=2", {
//   "headers": {
//     "accept": "*/*",
//     "accept-language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
//     "content-type": "application/json",
//     "referrer": "https://vip.104.com.tw/search/searchResult",
//     "sec-ch-ua": "\" Not A;Brand\";v=\"99\", \"Chromium\";v=\"92\"",
//     "sec-ch-ua-mobile": "?0",
//     "sec-fetch-dest": "empty",
//     "sec-fetch-mode": "cors",
//     "sec-fetch-site": "same-site",
//     "x-requested-with": "XMLHttpRequest"
//   },
//   "referrer": "https://vip.104.com.tw/",
//   "referrerPolicy": "strict-origin-when-cross-origin",
//   "body": null,
//   "method": "GET",
//   "mode": "cors",
//   "credentials": "include"
// });



// https://vip.104.com.tw/search/SearchResumeMaster?idno=30000001640732&sn=1&path_for_log=list_search&ec=105&search_meta=%7B%22page%22%3A1%2C%22fixed_update_date%22%3A20240415153536%2C%22total_hit%22%3A903%7D&formId=resume_contact%3D0%26kws%3D%25E8%25A8%25AD%25E8%25A8%2588%25E5%25B8%25AB%26jobcat%3D2013001005%252C2013001015%252C2013001016%252C2013001006%26city%3D6001001000%26home%3D6001001000%252C6001002000%26period%3D-1%26period_high%3D98%26role%3D1%26sex%3D2%26role_now%3D0%26switch_date_type%3D4%26switch_date%3D2024-04-08%26edu%3D2%252C4%252C8%252C16%252C32&kws=%E8%A8%AD%E8%A8%88%E5%B8%AB&rc=11011313
// https://vip.104.com.tw/search/SearchResumeMaster?idno=30000001640732&sn=1
// https://auth.vip.104.com.tw/vipapi/resume/search/30000001640732
