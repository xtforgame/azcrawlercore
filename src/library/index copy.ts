// ========================================
import axios from 'axios';
import puppeteer from 'puppeteer';
import utils from './utils';
// ========================================

const searchUrl = 'https://rent.591.com.tw/?kind=0&searchtype=1&sex=0&order=posttime&orderType=desc&region=1&rentprice=10000,18000&area=10,20&other=tragoods&hasimg=1&not_cover=1';

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
        '--disable-dev-profile',
      ],
    };
  }
  return undefined;
};

// const getList0 = async () => axios({
//   method: 'get',
//   url: 'https://rent.591.com.tw/home/search/rsList?is_new_list=1&type=1&kind=2&searchtype=1&sex=0&region=1&rentprice=10000,15000&area=10,20&other=tragoods&not_cover=1&hasimg=1&order=posttime&orderType=desc',
// });

const getList = async () => {
  const browser = await puppeteer.launch(getRunningOptions());
  // console.log('browser');
  const page = await browser.newPage();
  // console.log('page');
  const p = new Promise((resolve, reject) => {
    let fulfill = false;
    page.on('response', (resp) => {
      const url = resp.url();
      if (!fulfill && url.includes('rsList')) {
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
  await page.goto(searchUrl, {
    waitUntil: 'networkidle2',
  });
  const session = await page.target().createCDPSession();
  await session.send('Page.enable');
  // const { data } = await session.send('Page.captureSnapshot');
  // console.log(data);
  // fs.writeFileSync('./ssss.mhtml', data);
  return p.then(async (data) => {
    await browser.close();
    // console.log('data :', data);
    return { data };
  });
};


export default async function echo(d : any, err : Error) {
  const { data } = await getList();
  console.log('data?.data?.data :', data?.data?.data);
  if (err) {
    return Promise.reject(err);
  }
  return Promise.resolve(utils(d));
}