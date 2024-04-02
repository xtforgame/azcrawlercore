import fs from 'fs';
import path from 'path';
import moment from 'moment';
import { google, drive_v3 } from 'googleapis';
import puppeteer, { launch, Browser } from 'puppeteer';
import useProxy from 'puppeteer-page-proxy';
import readline from 'readline';
import XLSX from 'xlsx';
import { Readable } from 'stream';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';
import GoogleOAuth2Client from '~/utils/GoogleOAuth2Client';
import GoogleDriveManager from '~/utils/GoogleDriveManager';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];


export default class CrawlerBase {
  driveApis: drive_v3.Drive[];

  constructor() {
    this.driveApis = [];
  }

  async init() {
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

  async runX() {
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(true));
    try {
      if (1 == 1) {
        const page = await this.newPage(browser);
        await page.goto('https://sso.shoplineapp.com/users/sign_in', {
          waitUntil: 'networkidle2',
        });
        const session = await page.target().createCDPSession();
        await session.send('Page.enable');
        // await page.screenshot({ path: 'example.png' });
        await page.$eval('#staff_email', ($input) => $input.value = 'xtforgame@gmail.com');
        await page.$eval('#staff_password', ($input) => $input.value = 'qqwqqwqqw');
        await page.click('#new_staff button[name=button]');

        await promiseWait(2000);
        await promiseWaitFor(2000, async () => {
          return (page.url() !== 'https://sso.shoplineapp.com/users/two_factor_authentication')
          && (page.url() !== 'https://sso.shoplineapp.com/users/sign_in');
        });

        await promiseWait(5000);
        await page.goto('https://admin.shoplineapp.com/admin/kanebo/themes/layouts', {
          waitUntil: 'networkidle2',
        });

        await promiseWait(2000);

        // await page.reload({ waitUntil: ["networkidle0", "domcontentloaded"] });
        await page.reload({ waitUntil: 'networkidle2' });
        await promiseWait(1000);

        let callback: any;
        let resP: Promise<any> = Promise.resolve();
        page.on('response', async (resp) => {
          const url = resp.url();
          console.log('url :', url);
          if (url.includes('layout_components')) {
            const data = await resp.json();
            if (callback) {
              callback(data);
            }
          }
        });
        // const x = await page.$$eval('.document-file', ($lis) => {
        //   return Array.from($lis).length;
        // });

        const $lis = await page.$$('.document-file');

        await promiseReduce(Array.from($lis), async (_, $li) => {
          await $li.click();
          const data: any = await new Promise((res) => {
            const i = setTimeout(() => {
              if (callback) {
                callback = null;
                res(null);
              }
            }, 2000);
            callback = (d) => {
              res(d);
              callback = null;
              clearTimeout(i);
            }
          });
          // console.log('data :', data);
          fs.mkdirSync(`../kanebo/json`, { recursive: true });
          if (data?.name) {
            fs.writeFileSync(`../kanebo/${data.name}`, data.content, { encoding: 'utf-8' });
            fs.writeFileSync(`../kanebo/json/${data.name}.json`, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
          }
        }, null);
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


/*
<div class="intercom-post intercom-1sjltw e1n022i41">
  <div class="intercom-authored-container intercom-bmayvi e1atr8tr0">
    <div class="intercom-dhtp42 e1atr8tr1">
      <div class="intercom-1dvc4lw e1atr8tr2">
        <div class="intercom-tn3177 evxuo3e0"><img
            src="https://static.intercomassets.com/avatars/4321073/square_128/20211207-31_MKT_Zoe_Kung-1649754370.jpg"
            alt="Zoe profile"></div>
      </div>
      <div class="intercom-12ax1hg e1a94o2o0">
        <div class="test-author-summary-name-from intercom-128u8a2 e1a94o2o2"><span
            class="test-author-summary-name intercom-7wsxl4 e1a94o2o3">Zoe</span><span
            class="test-author-summary-from-clause intercom-xwnla5 e1a94o2o4"> 來自 SHOPLINE</span></div>
      </div>
    </div><span class="intercom-post-close intercom-dq8spb e1n022i42" aria-label="關閉" role="button" tabindex="0"></span>
    <div class="intercom-scrollable intercom-vzpz6w e11hrsmw0" tabindex="0">
      <div tabindex="-1" class="intercom-1revms er4a1r20">
        <div class="intercom-block-image intercom-6dk463 et4vnr0"><a
            href="https://www.bigmarker.com/shoplineapp/7-28-LINE-OA"
            data-via="https://via.intercom.io/c?url=https%3A%2F%2Fwww.bigmarker.com%2Fshoplineapp%2F7-28-LINE-OA&amp;h=42617eec9d8f548a37ca502a7fd709ff99ee5547-ryx6jq53_4581706039982&amp;l=cf00696e28c704a5f31e9ca4c41dc1615cf59cae-16286127">
            <div class="align-center intercom-ohwg9z e1dfxu9z0"><img
                src="https://downloads.intercomcdn.com/i/o/542298712/cbecda9673449864c6c931ba/0728+LINE+OA-banner.jpg"
                width="4000" height="2250" alt="" tabindex="0" class="intercom-1x0nbzk e1dfxu9z1" style=""></div>
          </a></div>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1jkel8h"><b>SHOPLINE 攜手 LINE 官方Ｘ起士公爵</b></div>
        <h1 class="e1z0ml3b0 intercom-exfymg">透過 LINE 搶奪商機<br>帶你超前部署雙 11</h1>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p">ADDICTION 網路旗艦店 您好：</div>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p">每天必開 APP LINE &nbsp;成為你我生活不可或缺一部分。身為品牌主該如何善用
          LINE 官方帳號成為與顧客間的溝通橋樑？ 特邀<b>甜點專家起士公爵 James </b>以自身經驗分享從獲客到留客好友經營策略，以及 <b>LINE 官方 Jarro </b>分享 LINE 全通路思維，如何透過
          LINE 廣告借力使力<b><br><br></b>精彩內容千萬別錯過</div>
        <h2 class="e10zs45w0 intercom-h01nkq">&nbsp;🔶 講座簡介 🔶</h2>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p">🗓 &nbsp;時間： 2022 / 7 / 28 (四) &nbsp;2-3
          pm<br>⛳️ &nbsp;地點：線上直播</div>
        <h2 class="e10zs45w0 intercom-h01nkq">&nbsp;🔶 &nbsp;精彩內容 &nbsp;🔶</h2>
        <ol class="intercom-1kcwmu e1bpfvzv0">
          <li class="intercom-es3ca">談觀念｜為什麼要經營 LINE 官方帳號？</li>
          <li class="intercom-es3ca">做實驗｜品牌各階段的操作精華與經營策略</li>
          <li class="intercom-es3ca">執行面｜剖析 LINE 的全通路行銷秘訣 - LINE 廣告、保證型版位</li>
          <li class="intercom-es3ca">享優惠｜SHOPLINE 獨家優惠大公開</li>
        </ol>
        <div class="intercom-block-button-container intercom-dlihp1 e1cfp3880"><a
            href="https://www.bigmarker.com/shoplineapp/7-28-LINE-OA"
            data-via="https://via.intercom.io/c?url=https%3A%2F%2Fwww.bigmarker.com%2Fshoplineapp%2F7-28-LINE-OA&amp;h=42617eec9d8f548a37ca502a7fd709ff99ee5547-ryx6jq53_4581706039982&amp;l=191c7b2f64c30090a772d86396c07219e2cfce2a-16286128"
            class="intercom-block-button intercom-1kt01ye e1cfp3881"><span class="intercom-es3ca">報名免費講座</span></a>
        </div>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p"> </div>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p">如對<b>課程</b>有任何疑問，歡迎您隨時回覆訊息！<br>或來信 <a
            href="mailto:ads-tw@shopplineapp.com" data-tracking-link-id="16286126" rel="nofollow noopener noreferrer"
            target="_blank">ads-tw@shoplineapp.com</a>，將有專人儘速與您聯繫，謝謝！</div>
        <div class="intercom-block-paragraph e16pl8n50 intercom-1wkrb3p"><br>SHOPLINE 行銷團隊</div>
      </div>
    </div>
    <div class="intercom-11gdw3w e1n022i43">
      <div class="intercom-post-composer intercom-lsqwrs e1n022i44" aria-label="開啟對話並回覆" role="button" tabindex="0">
        <span class="intercom-1baulvz e50zdj19">撰寫回覆</span></div>
    </div>
  </div>
</div>
*/