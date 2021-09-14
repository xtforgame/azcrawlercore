import mysql from 'mysql';
import { v4 } from 'uuid';
import fs from 'fs-extra';
import CrawlerBase, { PuppeteerHandlePageArg } from '../core/CrawlerBase';
import getGuru from '../getGuru';
import getEtfDb from '../getEtfDb';
import EtfManager from '../EtfManager';
import utils, { promiseReduce, toMap } from '../utils';


process.env.APIFY_LOCAL_STORAGE_DIR = 'apify_storage';
const Apify = require('apify');

// Apify.main is a helper function, you don't need to use it.

const exchanges = [
  { id: 'amex', name: 'AMEX' },
  { id: 'nasd', name: 'NASDAQ' },
  { id: 'nyse', name: 'NYSE' },
];

export default class Crawler extends CrawlerBase {
  getCurrentUrl() {
    if (!exchanges[this.fetchCounter]) {
      return '';
    }
    const url = `https://finviz.com/screener.ashx?v=111&f=exch_${exchanges[this.fetchCounter].id},ind_exchangetradedfund,sec_financial`;
    return url;
  }

  fetch = async () => {
    // Apify.openRequestQueue() creates a preconfigured RequestQueue instance.
    // We add our first request to it - the initial page the crawler will visit.
    const requestQueue = await Apify.openRequestQueue();
    const symbolStore = await Apify.openKeyValueStore('symbols');
    await requestQueue.addRequest({ url: this.getCurrentUrl() });

    // Create an instance of the PuppeteerCrawler class - a crawler
    // that automatically loads the URLs in headless Chrome / Puppeteer.
    const crawler = new Apify.PuppeteerCrawler({
      requestQueue,
      ...await this.getPuppeteerCrawlerOptions(),
      handlePageFunction: async ({ request, page }) => {
        // console.log('page :', page);
        console.log(`Processing ${request.url}...`);

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
        // Store the results to the default dataset.
        await Promise.all(data.scrapedData.map(async (d) => {
          await symbolStore.setValue(d.Ticker, {
            ...d,
            exchange: exchanges[this.fetchCounter],
          });
        }));
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
            await requestQueue.addRequest({ url: this.getCurrentUrl() });
          } else {
            console.log(`${request.url} is the last page!`);
            await this.onDone();
          }
        }
        // if (infos.length === 0) {
        // }
      },

      // This function is called if the page processing failed more than maxRequestRetries+1 times.
      handleFailedRequestFunction: async ({ request }) => {
        console.log(`Request ${request.url} failed too many times.`);
      },
    });

    // Run the crawler and wait for it to finish.
    await crawler.run();

    console.log('Crawler finished.');
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
