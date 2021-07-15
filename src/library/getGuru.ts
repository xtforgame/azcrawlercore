// ========================================
import axios from 'axios';
import puppeteer from 'puppeteer';
import { promiseReduce } from './utils';
// ========================================

// const searchUrl = 'https://www.gurufocus.com/etf/QQQ';

const getRunningOptions = () => {
  if (process.env.IN_DOCKER) {
    return {
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
        '--disable-dev-estimate',
      ],
    };
  }
  return {
    // devtools: true,
    // headless: false,
    // slowMo: 250,
  };
};

// const getList0 = async () => axios({
//   method: 'get',
//   url: 'https://rent.591.com.tw/home/search/rsList?is_new_list=1&type=1&kind=2&searchtype=1&sex=0&region=1&rentprice=10000,15000&area=10,20&other=tragoods&not_cover=1&hasimg=1&order=posttime&orderType=desc',
// });

export default async (keys) => {
  const browser = await puppeteer.launch(getRunningOptions());
  // console.log('browser');

  const estimates : any[] = [];

  await promiseReduce(keys, async (_, key) => {
    console.log('key :', key);

    const estimateUrl = `https://www.gurufocus.com/etf/${key}`;
    console.log('estimateUrl :', estimateUrl);
    let estimateRetry: Function;
    let estimateRetryLeft = 0;

    estimateRetry = async () => {
      try {
        const page = await browser.newPage();
        await page.setViewport({
          width: 1920,
          height: 1080
        });
        // console.log('page');
        const p = new Promise((resolve, reject) => {
          let fulfill = false;
          page.on('response', (resp) => {
            const url = resp.url();
            if (!fulfill && url.includes('fundamental_data')) {
              fulfill = true;
              resp.json().then(resolve);
            }
          });
          // setTimeout(() => {
          //   if (!fulfill) {
          //     fulfill = true;
          //     reject(new Error('Expired'));
          //   }
          // }, 15000);
        });
        await page.goto(estimateUrl, {
          waitUntil: 'networkidle2',
        });
        const session = await page.target().createCDPSession();
        await session.send('Page.enable');
        // const { data } = await session.send('Page.captureSnapshot');
        // console.log(data);
        // fs.writeFileSync('./ssss.mhtml', data);
        const price = await page.$$eval('.el-card.capture-area.is-never-shadow div', ($div) => {
          const kvs : any[] = [];
          // console.log('$div :', $div);

          const v = /\$([0-9.]+)/g.exec(($div[0]?.innerText || ''))?.[1] || '';
          if (v) {
            return parseFloat(v) || 0.0;
          }
          return 0.0;
        });
        const estimate = await p;

        const estimateResult = {
          key,
          estimate,
          price,
        };
        console.log('estimateResult :', estimateResult);
        estimates.push(estimateResult);
      } catch (error) {
        if (estimateRetryLeft <= 0) {
          console.log('error :', error);
          return false;
        }
        estimateRetryLeft--;
        return estimateRetry();
      }
      return true;
    };
    await estimateRetry();
  }, null);
  return estimates;
};


// export default async function echo(d : any, err : Error) {
//   const { data } = await getList();
//   console.log('data :', data);
//   if (err) {
//     return Promise.reject(err);
//   }
//   return Promise.resolve(utils(d));
// }