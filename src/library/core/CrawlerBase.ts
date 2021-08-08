import mysql from 'mysql';
import { v4 } from 'uuid';
import fs from 'fs-extra';
import Apify, { PuppeteerHandlePage, PuppeteerCrawlerOptions, RequestQueue, KeyValueStore } from 'apify';

import utils, { promiseReduce, ArgumentTypes, ReturnType } from '../utils';

export type PuppeteerHandlePageArg = ArgumentTypes<PuppeteerHandlePage>[0];

export type AddRequestArgs = ArgumentTypes<RequestQueue['addRequest']>;
export type AddRequestReturn = ReturnType<RequestQueue['addRequest']>;

// const Apify = require('apify');

// Apify.main is a helper function, you don't need to use it.


export default class CrawlerBase {
  fetchCounter: number;

  requestQueue!: RequestQueue;

  requestStore!: KeyValueStore;

  constructor() {
    this.fetchCounter = 0;
  }

  exchanges = [
    { id: 'amex', name: 'AMEX' },
    { id: 'nasd', name: 'NASDAQ' },
    { id: 'nyse', name: 'NYSE' },
  ];

  getCurrentUrl() {
    if (!this.exchanges[this.fetchCounter]) {
      return '';
    }
    // const url = `https://finviz.com/screener.ashx?v=111&f=exch_${this.exchanges[this.fetchCounter].id},ind_exchangetradedfund,sec_financial`;
    const url = `https://finviz.com/screener.ashx?v=111&f=exch_${this.exchanges[this.fetchCounter].id}`;
    return url;
  }

  async getPuppeteerCrawlerOptions() : Promise<PuppeteerCrawlerOptions> {
    const proxyConfiguration = await Apify.createProxyConfiguration({
      proxyUrls: ['http://spe19aeb13:XEdSfouN79@gate.dc.smartproxy.com:20000'],
    });
    const options : any = {
      proxyConfiguration,
      preNavigationHooks: [
        async (crawlingContext, gotoOptions) => {
          const { page } = crawlingContext;
          const info = await this.requestStore.getValue(crawlingContext.request.id);
          page.setRequestInterception(true);
          page.on('request', (request) => {
            if (['image', 'stylesheet', 'font', 'script'].indexOf(request.resourceType()) !== -1) {
                request.abort();
            } else {
                request.continue();
            }
          });
          // if (info?.type === 'quote') {
          //   // page.on('response', (resp) => {
          //   //   const url = resp.url();
          //   //   console.log('url :', url);
          //   //   // if (!fulfill && url.includes('fundamental_data')) {
          //   //   //   fulfill = true;
          //   //   //   resp.json().then(resolve);
          //   //   // }
          //   // });
          //   // setTimeout(() => {
          //   //   if (!fulfill) {
          //   //     fulfill = true;
          //   //     reject(new Error('Expired'));
          //   //   }
          //   // }, 15000);
          // }


          // const { page } = crawlingContext;
          // // console.log('page :', page);
          // await page.evaluate((attr) => { window.foo = attr; }, 'bar');
        }
      ],

      // Here you can set options that are passed to the Apify.launchPuppeteer() function.
      launchContext: {
        launchOptions: {
          headless: true,

          // devtools: true,
          // headless: false,
          // slowMo: 250,

          // Other Puppeteer options
        },
      },
      handlePageTimeoutSecs: 999999,
      handlePageFunction: async () => {},
      // This function is called if the page processing failed more than maxRequestRetries+1 times.
      handleFailedRequestFunction: async ({ request }) => {
        console.log(`Request ${request.url} failed too many times.`);
      },
    }
    console.log('process.env.IN_DOCKER :', process.env.IN_DOCKER);
    if (process.env.IN_DOCKER) {
      options.launchPuppeteerOptions = {
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
        ],
      };
    }
    return options;
  }

  async addRequestEx(type: string, extraValues: any, ...args: AddRequestArgs) : AddRequestReturn {
    const req = await this.requestQueue.addRequest(...args);
    await this.requestStore.setValue(req.requestId, {
      type,
      ...extraValues,
    });
    return req;
  }

  async fetch() {
    await Apify.main(async () => {
      // Apify.openRequestQueue() creates a preconfigured RequestQueue instance.
      // We add our first request to it - the initial page the crawler will visit.
      this.requestQueue = await Apify.openRequestQueue();
      this.requestStore = await Apify.openKeyValueStore('requests');
      await this.addRequestEx('list', null, { url: this.getCurrentUrl() });

      // Create an instance of the PuppeteerCrawler class - a crawler
      // that automatically loads the URLs in headless Chrome / Puppeteer.
      const crawler = new Apify.PuppeteerCrawler({
        requestQueue: this.requestQueue,
        ...await this.getPuppeteerCrawlerOptions(),
      });

      // Run the crawler and wait for it to finish.
      await crawler.run();

      console.log('Crawler finished.');
    });
  };


  async onDone () {
  }
}
