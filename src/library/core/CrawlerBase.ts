import fs from 'fs';
import path from 'path';
import moment from 'moment';
import puppeteer, { launch, Browser } from 'puppeteer';
import useProxy from 'puppeteer-page-proxy';
import { promiseWait, promiseWaitFor } from '~/utils';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];

export default class CrawlerBase {

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

  async run() {
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(true));
    const page = await this.newPage(browser);
    // await useProxy(page, 'http://127.0.0.1:80');
    // console.log('page');
    const p = new Promise((resolve, reject) => {
      let fulfill = false;
      page.on('response', (resp) => {
        const url = resp.url();
        if (!fulfill && url.includes('spec.json')) {
          fulfill = true;
          resp.json().then(resolve);
        }
      });
      setTimeout(() => {
        if (!fulfill) {
          fulfill = true;
          reject(new Error('Expired'));
        }
      }, 15000);
    });
    await page.goto('https://httpbin.org', {
      waitUntil: 'networkidle2',
    });
    const session = await page.target().createCDPSession();
    await session.send('Page.enable');
    // await page.screenshot({ path: 'example.png' });
    const json = await p;
    console.log('json :', json);
    const title = await page.$$eval('hgroup h2.title', ($div) => {
      debugger;
      return $div?.[0]?.innerHTML || '';
    });
    console.log('title :', title);
    await browser.close();
    return 1;
  }
}
