import axios from 'axios';
import utils from './utils';

const Apify = require('apify');

// Apify.main is a helper function, you don't need to use it.


export default async function echo(data : any, err : Error) {
  await Apify.main(async () => {
    // Apify.openRequestQueue() creates a preconfigured RequestQueue instance.
    // We add our first request to it - the initial page the crawler will visit.
    const requestQueue = await Apify.openRequestQueue();
    await requestQueue.addRequest({ url: 'https://etfdb.com/data_set/?tm=87787&cond={%22by_type%22:[%22Etfdb::EtfType%22,1930,null,false,false]}&no_null_sort=true&count_by_id=&limit=1&sort=symbol&order=asc&limit=1&offset=0' });

    // Create an instance of the PuppeteerCrawler class - a crawler
    // that automatically loads the URLs in headless Chrome / Puppeteer.
    const crawler = new Apify.PuppeteerCrawler({
      requestQueue,

      // Here you can set options that are passed to the Apify.launchPuppeteer() function.
      launchContext: {
        launchOptions: {
          devtools: true,
          headless: false,
          slowMo: 250,
          // Other Puppeteer options
        },
      },

      // Stop crawling after several pages
      maxRequestsPerCrawl: 50,

      // This function will be called for each URL to crawl.
      // Here you can write the Puppeteer scripts you are familiar with,
      // with the exception that browsers and pages are automatically managed by the Apify SDK.
      // The function accepts a single parameter, which is an object with the following fields:
      // - request: an instance of the Request class with information such as URL and HTTP method
      // - page: Puppeteer's Page object (see https://pptr.dev/#show=api-class-page)
      handlePageFunction: async ({ request, response, body, page }) => {
        // console.log('page :', page);
        console.log('request.url :', request.url);
        if (request.url.startsWith('https://www.morningstar.com')) {
          console.log('page :', page);
          const data = await page.$$eval('.mdc-link.mdc-security-module__name.mds-link.mds-link--no-underline', ($posts) => {
            const scrapedData = [];
            // We're getting the title, rank and URL of each post on Hacker News.
            $posts.forEach(($post) => {
              console.log('$post :', $post);
              scrapedData.push({
                title: $post.innerText,
                href: $post.href,
              });
            });

            return scrapedData;
          });
          // Store the results to the default dataset.
          await Apify.pushData(data);
          return;
        }
        console.log(`Processing ${request.url}...`);
        const data = await response.json();
        // console.log('response :', data);

        // const { data } = await axios({
        //   url: 'https://etfdb.com/data_set/?tm=87787&cond={%22by_type%22:[%22Etfdb::EtfType%22,1930,null,false,false]}&no_null_sort=true&count_by_id=&limit=25&sort=symbol&order=asc&limit=25&offset=0',
        // });

        const symbols = data?.rows.map(r => /etf\/([A-Za-z]+)/i.exec(r.symbol)[1]).filter(s => s);
        console.log('symbols :', symbols);
        // // Store the results to the default dataset.
        // await Apify.pushData(data);

        // // Find a link to the next page and enqueue it if it exists.
        // const infos = await Apify.utils.enqueueLinks({
        //   page,
        //   requestQueue,
        //   pseudoUrls: symbols.map(s => `https://www.morningstar.com/search?query=${s}`),
        // });

        await Promise.all(symbols.map(async (s) => {
          await requestQueue.addRequest(
            { url: `https://www.morningstar.com/search?query=${s}` },
          );
        }));

        // if (infos.length === 0) console.log(`${request.url} is the last page!`);
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
