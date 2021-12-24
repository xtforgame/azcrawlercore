import fs from 'fs';
import path from 'path';
import moment from 'moment';
import puppeteer, { launch, Browser } from 'puppeteer';
import useProxy from 'puppeteer-page-proxy';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];


type Exchange = {
  id: string;
  name: string;
};

const exchanges : Exchange[] = [
  { id: 'amex', name: 'AMEX' },
  { id: 'nasd', name: 'NASDAQ' },
  { id: 'nyse', name: 'NYSE' },
];

export class DataStore {
  filepath: string;

  constructor(filepath: string) {
    this.filepath = filepath;
  }

  setValue(path: string, data: any) {

  }
}

export default class CrawlerBase {
  symbolStore: DataStore;
  resultStore: DataStore;

  constructor() {
    this.symbolStore = new DataStore('xxxxx');
    this.resultStore = new DataStore('result');
  }

  getExchangeStartUrl(exchange : Exchange) {
    return `https://finviz.com/screener.ashx?v=111&f=exch_${exchange.id}`;
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

  async handleQuoteResult(page: puppeteer.Page, exchange: Exchange, url: string, symbol: string) {
    const data = await page.$$eval('.fullview-profile', ($profile: Element[]) => {
      return {
        url: '',
        scrapedData: $profile?.[0]?.innerText || '',
      };
    });

    data.url = url;

    await this.resultStore.setValue(symbol, data);

    // console.log('data :', data);
  }

  async handleListResult(page: puppeteer.Page, exchange: Exchange, url: string) {
    // A function to be evaluated by Puppeteer within the browser context.
    const data = await page.$$eval('#screener-content tbody tr:nth-child(4) tbody', ($tbody) => {
      const scrapedData : any[] = [];

      const $etfs : any[] = Array.from($tbody[0].querySelectorAll('tr'));
      const $header = $etfs.shift();
      const $columns : any[] = Array.from($header.querySelectorAll('td'));
      // We're getting the title, rank and URL of each post on Hacker News.
      $etfs.forEach(($etf) => {
        const record = {};
        const a : any[] = Array.from($etf.querySelectorAll('td'));
        a.forEach((cell, i) => {
          record[$columns[i].innerText] = cell.innerText;
        });
        scrapedData.push(record);
      });

      const tabLinks = document.querySelectorAll('.screener_pagination .tab-link');
      // console.log('x :', x);
      // debugger;
      return {
        scrapedData,
        tabLinks: tabLinks.length,
      };
    });

    console.log('data :', data);

    // Store the results to the default dataset.
    await promiseReduce<any>(data.scrapedData, async (_, d) => {
      await this.symbolStore.setValue(d.Ticker, {
        ...d,
        exchange,
      });

      await this.newBrowser(`https://finviz.com/quote.ashx?t=${d.Ticker}`, {}, async ({
        page, url,
      }) => {
        await this.handleQuoteResult(page, exchange, url, d.Ticker);
      });

      // const req = await requestQueue.addRequest({ url: `https://finviz.com/quote.ashx?t=${d.Ticker}` });
      // await requestStore.setValue(req.requestId, {
      //   type: 'quote',
      //   symbol: d.Ticker,
      // });
    }, <any>null);
    // await Apify.pushData(data);

    // // Find a link to the next page and enqueue it if it exists.
    // const infos = await Apify.utils.enqueueLinks({
    //   page,
    //   requestQueue,
    //   selector: '.screener_pagination a.tab-link:last-child',
    // });
    // await promiseReduce<any>(infos, async (_, info) => {
    //   await requestStore.setValue(info.requestId, {
    //     type: 'list',
    //   });
    // }, <any>null);

    // if (data.tabLinks === 2 && this.getCurrentUrl() !== request.url) {
    //   this.fetchCounter++;
    //   if (this.fetchCounter < exchanges.length) {
    //     const req = await requestQueue.addRequest({ url: this.getCurrentUrl() });
    //     await requestStore.setValue(req.requestId, {
    //       type: 'list',
    //     });
    //   } else {
    //     console.log(`${request.url} is the last page!`);
    //     await this.onDone();
    //   }
    // }
    // // if (infos.length === 0) {
    // // }
  }

  async newBrowser<Args = any>(url: string, args: Args, p: (params: {
    browser: puppeteer.Browser;
    page: puppeteer.Page;
    url: string;
    args: Args;
  }) => Promise<any>) {
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(true));
    const page = await this.newPage(browser);
    await useProxy(page, 'http://spe19aeb13:XEdSfouN79@gate.dc.smartproxy.com:20000');
    // console.log('page');
    await page.goto(url, {
      waitUntil: 'networkidle2',
    });
    const session = await page.target().createCDPSession();
    await session.send('Page.enable');
    try {
      await p({ browser, page, url, args });
    } catch (error) {
      console.log('error :', error);
    }
    await browser.close();
  }

  async fetchExchange(exchange: Exchange) {
    await this.newBrowser(this.getExchangeStartUrl(exchange), {}, async ({
      page, url,
    }) => {
      await this.handleListResult(page, exchange, url);
    });
    return 1;
  }

  async run() {
    await promiseReduce(exchanges, async (_, exchange) => {
      await this.fetchExchange(exchange);
    }, null);
  }
}
