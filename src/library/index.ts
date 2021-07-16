import utils from './utils';
import getGuru from './getGuru';
import getEtfDb from './getEtfDb';

const Apify = require('apify');

// Apify.main is a helper function, you don't need to use it.

const startUrl = 'https://finviz.com/screener.ashx?v=111&f=ind_exchangetradedfund,sec_financial&r=1981';

export default async function echo(data : any, err : Error) {
  await Apify.main(async () => {
    // Apify.openRequestQueue() creates a preconfigured RequestQueue instance.
    // We add our first request to it - the initial page the crawler will visit.
    const requestQueue = await Apify.openRequestQueue();
    const symbolStore = await Apify.openKeyValueStore('symbols');
    const gurufocusStore = await Apify.openKeyValueStore('gurufocus');
    const etfDbProfileStore = await Apify.openKeyValueStore('etfDbProfile');
    const etfDbScoreStore = await Apify.openKeyValueStore('etfDbScore');
    await requestQueue.addRequest({ url: startUrl });

    // Create an instance of the PuppeteerCrawler class - a crawler
    // that automatically loads the URLs in headless Chrome / Puppeteer.
    const crawler = new Apify.PuppeteerCrawler({
      requestQueue,

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
      handlePageFunction: async ({ request, page }) => {
        // console.log('page :', page);
        console.log(`Processing ${request.url}...`);

        // A function to be evaluated by Puppeteer within the browser context.
        const data = await page.$$eval('#screener-content tbody tr:nth-child(4) tbody', ($tbody) => {
          const scrapedData = [];

          const $etfs = Array.from($tbody[0].querySelectorAll('tr'));
          const $header = $etfs.shift(0);
          const $columns = Array.from($header.querySelectorAll('td'));
          // We're getting the title, rank and URL of each post on Hacker News.
          $etfs.forEach(($etf) => {
            const record = {};
            const a = Array.from($etf.querySelectorAll('td'));
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
          await symbolStore.setValue(d.Ticker, d);
        }));
        // await Apify.pushData(data);

        // Find a link to the next page and enqueue it if it exists.
        const infos = await Apify.utils.enqueueLinks({
          page,
          requestQueue,
          selector: '.screener_pagination a.tab-link:last-child',
        });

        if (data.tabLinks === 2 && startUrl !== request.url) {
          console.log(`${request.url} is the last page!`);
          const etfInfo : any[] = [];
          await symbolStore.forEachKey(async (key, index, info) => {
            const value = await symbolStore.getValue(key);
            etfInfo.push({ key, index, info, value });
          });


          const keys = etfInfo.map(v => v.key);
          const etfDbResults = await getEtfDb(keys);
          await Promise.all(etfDbResults.profiles.map(async (d) => {
            // console.log('d :', d);
            await etfDbProfileStore.setValue(d.key, d);
          }));
          await Promise.all(etfDbResults.ratings.map(async (d) => {
            // console.log('d :', d);
            await etfDbScoreStore.setValue(d.key, d);
          }));

          const guruResults = await getGuru(etfInfo);
          await Promise.all(guruResults.map(async (d) => {
            // console.log('d :', d);
            await gurufocusStore.setValue(d.key, d);
          }));
          console.log('guruResults :', guruResults);


          // const d2 = await getEtfDb(`https://etfdb.com/etf/${key}/#realtime-rating`);
          // console.log('d2 :', d2);
        }
        if (infos.length === 0) {
          
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

  if (err) {
    return Promise.reject(err);
  }
  return Promise.resolve(utils(data));
}
