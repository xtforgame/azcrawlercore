import mysql from 'mysql';
import { v4 } from 'uuid';
import fs from 'fs-extra';
import Apify, { KeyValueStore, PuppeteerHandlePage, PuppeteerCrawlerOptions } from 'apify';

import utils, { promiseReduce, ArgumentTypes } from '../utils';
import CrawlerBase, { PuppeteerHandlePageArg } from '../core/CrawlerBase';

process.env.APIFY_LOCAL_STORAGE_DIR = 'apify_storage';

export default class Crawler extends CrawlerBase {
  symbolStore!: KeyValueStore;
  newsListStore!: KeyValueStore;
  newsStore!: KeyValueStore;

  handleListResult = async ({ request, page }: PuppeteerHandlePageArg, options?: any) => {
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
      await this.symbolStore.setValue(d.Ticker, {
        ...d,
        exchange: this.exchanges[this.fetchCounter],
      });
      const req = await this.requestQueue.addRequest({ url: `https://www.marketwatch.com/investing/stock/${d.Ticker}` });
      await this.requestStore.setValue(req.requestId, {
        type: 'news-list',
        symbol: d.Ticker,
      });
    }, <any>null);
    // await Apify.pushData(data);

    // Find a link to the next page and enqueue it if it exists.
    const infos = await Apify.utils.enqueueLinks({
      page,
      requestQueue: this.requestQueue,
      selector: '.screener_pagination a.tab-link:last-child',
    });
    await promiseReduce<any>(infos, async (_, info) => {
      await this.requestStore.setValue(info.requestId, {
        type: 'list',
      });
    }, <any>null);

    if (data.tabLinks === 2 && this.getCurrentUrl() !== request.url) {
      this.fetchCounter++;
      if (this.fetchCounter < this.exchanges.length) {
        await this.addRequestEx('list', null, { url: this.getCurrentUrl() });
      } else {
        console.log(`${request.url} is the last page!`);
        await this.onDone();
      }
    }
    // if (infos.length === 0) {
    // }
  }

  handleNewsListResult = async ({ request, page }: PuppeteerHandlePageArg, options?: any) => {
    // A function to be evaluated by Puppeteer within the browser context.
    const data = await page.$$eval('[data-channel=MarketWatch] .element--article a.figure__image', ($as) => {
      const scrapedData : any[] = [];
      $as.forEach(($a) => {
        const record = {
          url: $a!.getAttribute('href'),
        };
        scrapedData.push(record);
      });
      return {
        scrapedData,
      };
    });

    const info = await this.requestStore.getValue(request.id);
    await this.newsListStore.setValue(info!.symbol, data);

    await promiseReduce<any>(data.scrapedData.filter(newsInfo => newsInfo.url), async (_, newsInfo, index) => {
      if (index >= 5) {
        return;
      }
      await this.addRequestEx('news', {
        symbol: info!.symbol,
        index,
      }, {
        url: newsInfo.url,
      });
    }, <any>null);

    // if (infos.length === 0) {
    // }
  }

  handleNewsResult = async ({ request, page }: PuppeteerHandlePageArg, options?: any) => {
    // A function to be evaluated by Puppeteer within the browser context.
    const parselyTags = await page.$$eval('meta[name=parsely-tags]', ($metas) => {
      if (!$metas[0]) {
        return null;
      }
      return {
        scrapedData: $metas[0]!.getAttribute('content'),
      };
    });

    const tags = await page.$$eval('meta[name=news_keywords]', ($metas) => {
      if (!$metas[0]) {
        return null;
      }
      return {
        scrapedData: $metas[0]!.getAttribute('content'),
      };
    });

    if (!parselyTags && !tags) {
      return;
    }

    const info = await this.requestStore.getValue(request.id);
    await this.newsStore.setValue(`${info!.symbol}-${info!.index}`, {
      parselyTags,
      tags,
    });

    // if (infos.length === 0) {
    // }
  }

  async getPuppeteerCrawlerOptions() : Promise<PuppeteerCrawlerOptions> {
    const options = await super.getPuppeteerCrawlerOptions();
    return {
      ...options,
      handlePageFunction: async (arg) => {
        // console.log('page :', page);
        const { request } = arg;

        console.log(`Processing ${request.url}...`);
        console.log('request.id :', request.id);

        const info = await this.requestStore.getValue(request.id);
        if (info?.type === 'list') {
          return this.handleListResult(arg);
        } else if (info?.type === 'news-list') {
          return this.handleNewsListResult(arg);
        } else if (info?.type === 'news') {
          return this.handleNewsResult(arg);
        }
      },
    };
  }

  async fetch() {
    // await fs.remove(`${process.env.APIFY_LOCAL_STORAGE_DIR}`);
    this.symbolStore = await Apify.openKeyValueStore('symbols');
    this.newsListStore = await Apify.openKeyValueStore('newsList');
    this.newsStore = await Apify.openKeyValueStore('news');
    return super.fetch();
  };
}
