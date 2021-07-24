import mysql from 'mysql';
import { v4 } from 'uuid';
import fs from 'fs-extra';

import EtfManager from '../EtfManager';
import utils, { promiseReduce, toMap } from '../utils';


process.env.APIFY_LOCAL_STORAGE_DIR = 'apify_storage_xx';
const Apify = require('apify');

// Apify.main is a helper function, you don't need to use it.

const exchanges = [
  { id: 'amex', name: 'AMEX' },
  { id: 'nasd', name: 'NASDAQ' },
  { id: 'nyse', name: 'NYSE' },
];

export default class Crawler {
  fetchCounter : number;

  constructor() {
    this.fetchCounter = 0;
  }

  getCurrentUrl() {
    if (!exchanges[this.fetchCounter]) {
      return '';
    }
    const url = `https://finviz.com/screener.ashx?v=111&f=exch_${exchanges[this.fetchCounter].id},ind_exchangetradedfund,sec_financial`;
    return url;
  }

  handleListResult = async ({ request, page }, options : any) => {
    const {
      symbolStore,
      requestQueue,
      requestStore,
    } = options;
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

    // Store the results to the default dataset.
    await promiseReduce<any>(data.scrapedData, async (_, d) => {
      await symbolStore.setValue(d.Ticker, {
        ...d,
        exchange: exchanges[this.fetchCounter],
      });
      const req = await requestQueue.addRequest({ url: `https://finviz.com/quote.ashx?t=${d.Ticker}` });
      await requestStore.setValue(req.requestId, {
        type: 'quote',
      });
    }, <any>null);
    // await Apify.pushData(data);

    // Find a link to the next page and enqueue it if it exists.
    const infos = await Apify.utils.enqueueLinks({
      page,
      requestQueue,
      selector: '.screener_pagination a.tab-link:last-child',
    });

    if (data.tabLinks === 2 && this.getCurrentUrl() !== request.url) {
      this.fetchCounter++;
      if (this.fetchCounter < exchanges.length) {
        const req = await requestQueue.addRequest({ url: this.getCurrentUrl() });
        await requestStore.setValue(req.requestId, {
          type: 'list',
        });
      } else {
        console.log(`${request.url} is the last page!`);
        await this.onDone();
      }
    }
    // if (infos.length === 0) {
    // }
  }

  handleQuoteResult = async ({ request, page }, options : any) => {
    const {
      symbolStore,
      requestQueue,
    } = options;
    const data = await page.$$eval('#news-table tr', ($trs: HTMLElement[]) => {
      const scrapedData : any[] = [];
      $trs.forEach(($tr) => {
        const $newsLink = $tr.querySelector('.news-link-left a');
        const xsx = $tr.querySelector('.news-link-right');

        if ($newsLink) {
          const record = {
            title: $newsLink!.innerText,
            link: $newsLink!.getAttribute('href'),
          };
          // const a : any[] = Array.from($tr.querySelectorAll('td:nth-child(2) a'));
          // a.forEach((cell, i) => {
          //   record[$columns[i].innerText] = cell.innerText;
          // });
          scrapedData.push(record);
        }
      });
      return {
        scrapedData,
      };
    });
    // console.log('data :', data);
  }

  fetch = async () => {
    await fs.remove(`${process.env.APIFY_LOCAL_STORAGE_DIR}`);
    await Apify.main(async () => {
      // Apify.openRequestQueue() creates a preconfigured RequestQueue instance.
      // We add our first request to it - the initial page the crawler will visit.
      const requestQueue = await Apify.openRequestQueue();
      const symbolStore = await Apify.openKeyValueStore('symbols');
      const requestStore = await Apify.openKeyValueStore('requests');
      const req = await requestQueue.addRequest({ url: this.getCurrentUrl() });
      await requestStore.setValue(req.requestId, {
        type: 'list',
      });

      // Create an instance of the PuppeteerCrawler class - a crawler
      // that automatically loads the URLs in headless Chrome / Puppeteer.
      const crawler = new Apify.PuppeteerCrawler({
        requestQueue,

        preNavigationHooks: [
          async (crawlingContext, gotoOptions) => {
            const { page } = crawlingContext;
            const info = await requestStore.getValue(crawlingContext.request.id);
            console.log('info :', info);
            if (info?.type === 'list') {
            } else if (info?.type === 'quote') {
              page.on('response', (resp) => {
                const url = resp.url();
                console.log('url :', url);
                // if (!fulfill && url.includes('fundamental_data')) {
                //   fulfill = true;
                //   resp.json().then(resolve);
                // }
              });
              // setTimeout(() => {
              //   if (!fulfill) {
              //     fulfill = true;
              //     reject(new Error('Expired'));
              //   }
              // }, 15000);
            }


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

        // Stop crawling after several pages
        // maxRequestsPerCrawl: 50,

        // This function will be called for each URL to crawl.
        // Here you can write the Puppeteer scripts you are familiar with,
        // with the exception that browsers and pages are automatically managed by the Apify SDK.
        // The function accepts a single parameter, which is an object with the following fields:
        // - request: an instance of the Request class with information such as URL and HTTP method
        // - page: Puppeteer's Page object (see https://pptr.dev/#show=api-class-page)
        handlePageFunction: async (arg) => {
          // console.log('page :', page);
          const { request } = arg;
          console.log(`Processing ${request.url}...`);
          console.log('request.id :', request.id);

          const info = await requestStore.getValue(request.id);
          console.log('info :', info);
          if (info?.type === 'list') {
            return this.handleListResult(arg, { requestQueue, symbolStore, requestStore });
          } else if (info?.type === 'quote') {
            return this.handleQuoteResult(arg, { requestQueue, symbolStore, requestStore });
          }
        },

        // This function is called if the page processing failed more than maxRequestRetries+1 times.
        handleFailedRequestFunction: async ({ request }) => {
          console.log(`Request ${request.url} failed too many times.`);
        },
      });

      // Run the crawler and wait for it to finish.
      await crawler.run();

      console.log('Crawler finished.');
    });
  };


  onDone = async () => {
    // const symbolStore = await Apify.openKeyValueStore('symbols');
    // const gurufocusStore = await Apify.openKeyValueStore('gurufocus');
    // const etfDbProfileStore = await Apify.openKeyValueStore('etfDbProfile');
    // const etfDbScoreStore = await Apify.openKeyValueStore('etfDbScore');

    // const etfInfo : any[] = [];
    // await symbolStore.forEachKey(async (key, index, info) => {
    //   const value = await symbolStore.getValue(key);
    //   etfInfo.push({
    //     key, index, info, value,
    //   });
    // });


    // const sliceIntoChunks = (arr, chunkSize) => {
    //   const res : any[] = [];
    //   for (let i = 0; i < arr.length; i += chunkSize) {
    //     const chunk = arr.slice(i, i + chunkSize);
    //     res.push(chunk);
    //   }
    //   return res;
    // };

    // const etfInfoChunks : any[][] = sliceIntoChunks(etfInfo, 20);
    // await promiseReduce(etfInfoChunks, async (_, etfInfoChunk) => {
    //   const keys = etfInfoChunk.map(v => v.key);

    //   const [etfDbResults, guruResults] = await Promise.all([
    //     getEtfDb(keys),
    //     getGuru(etfInfoChunk),
    //   ]);
    //   await Promise.all(etfDbResults.profiles.map(async (d) => {
    //     // console.log('d :', d);
    //     await etfDbProfileStore.setValue(d.key, d);
    //   }));
    //   await Promise.all(etfDbResults.ratings.map(async (d) => {
    //     // console.log('d :', d);
    //     await etfDbScoreStore.setValue(d.key, d);
    //   }));

    //   await Promise.all(guruResults.map(async (d) => {
    //     // console.log('d :', d);
    //     await gurufocusStore.setValue(d.key, d);
    //   }));
    //   console.log('guruResults :', guruResults);
    // }, null);

    // // const d2 = await getEtfDb(`https://etfdb.com/etf/${key}/#realtime-rating`);
    // // console.log('d2 :', d2);
  }
}
