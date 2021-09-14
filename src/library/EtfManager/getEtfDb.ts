// ========================================
import axios from 'axios';
import puppeteer from 'puppeteer';
import { promiseReduce } from '../utils';
// ========================================

// const ratingUrl = 'https://www.gurufocus.com/etf/QQQ';

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
  const loginUrl = 'https://etfdb.com/members/login/?redirect_url=%2F';
  const browser = await puppeteer.launch(getRunningOptions());
  // console.log('browser');
  const loginPage = await browser.newPage();
  await loginPage.setViewport({
    width: 1920,
    height: 1080,
  });
  await loginPage.goto(loginUrl, {
    waitUntil: 'networkidle2',
  });


  // await loginPage.type('#user_login', 'xtforgame@gmail.com');
  // await loginPage.type('#password', 'qqppaall');
  await loginPage.evaluate(() => {
    (<any>document.querySelector('#user_login')).value = 'xtforgame@gmail.com';
    (<any>document.querySelector('#password')).value = 'qqppaall';
    (<any>document.querySelector('#remember')).click();
  });
  await Promise.all([
    loginPage.click('#login-button'),
    loginPage.waitForNavigation({ waitUntil: 'networkidle0' }),
  ]);

  const profiles : any[] = [];
  const ratings : any[] = [];

  await promiseReduce(keys, async (_, key) => {
    console.log('key :', key);

    const profileUrl = `https://etfdb.com/etf/${key}/#etf-ticker-profile`;
    console.log('profileUrl :', profileUrl);
    let profileRetry: Function;
    let profileRetryLeft = 3;

    profileRetry = async () => {
      try {
        const page = await browser.newPage();
        await page.setViewport({
          width: 1920,
          height: 1080,
        });
        await page.goto(profileUrl, {
          waitUntil: 'networkidle2',
        });
        const session = await page.target().createCDPSession();
        await session.send('Page.enable');
        // const { data } = await session.send('Page.captureSnapshot');
        // console.log(data);
        // fs.writeFileSync('./ssss.mhtml', data);
        const profile = await page.$$eval('#overview .panel-body .row .list-unstyled', ($list) => {
          const kvs : any[] = [];
          console.log('$list :', $list);
          // debugger;
          for (let i = 0; i < 2; i++) {
            if ($list[i]) {
              // debugger;
              const lis = Array.from($list[i].querySelectorAll('li'));
              // debugger;
              lis.forEach((li) => {
                const parseValue = (span: HTMLElement) => {
                  if (!span) {
                    return { value: '', link: '' };
                  }
                  if (span?.children?.[0]?.tagName === 'A') {
                    return { value: (<any>span?.children?.[0]).innerText || '', link: span?.children?.[0].getAttribute('href') || '' };
                  } else {
                    return { value: span?.innerText || '', link: '' };
                  }
                };
                const spans = Array.from(li.querySelectorAll('span'));
                const key = spans[0].innerText || '';
                const value = parseValue(spans[1]);
                // console.log('spans :', spans);
                kvs.push({ key, value });
              });
              // debugger;
            }
          }
          // console.log('kvs :', kvs);
          // debugger;
          return kvs;
        });

        const profileResult = {
          key,
          profile,
        };
        console.log('profileResult :', profileResult);
        profiles.push(profileResult);
      } catch (error) {
        if (profileRetryLeft <= 0) {
          console.log('error :', error);
          return false;
        }
        profileRetryLeft--;
        return profileRetry();
      }
      return true;
    };
    await profileRetry();

    const ratingUrl = `https://etfdb.com/etf/${key}/#realtime-rating`;
    console.log('ratingUrl :', ratingUrl);
    let ratingRetry: Function;
    let ratingRetryLeft = 3;

    ratingRetry = async () => {
      try {
        const page = await browser.newPage();
        await page.setViewport({
          width: 1920,
          height: 1080,
        });
        await page.goto(ratingUrl, {
          waitUntil: 'networkidle2',
        });
        const session = await page.target().createCDPSession();
        await session.send('Page.enable');
        // const { data } = await session.send('Page.captureSnapshot');
        // console.log(data);
        // fs.writeFileSync('./ssss.mhtml', data);
        const overallRating = await page.$$eval('.panel-body .h4.badge.badge-primary', ($v) => {
          console.log('$v :', $v);
          // debugger;
          return ((<any>$v[0]).innerText || '').replace(/\n/gm, '');
        });
        const liquidity = await page.$$eval('#rc-1-liquidity td', ($v) => {
          console.log('$v :', $v);
          // debugger;
          return ((<any>$v?.[1]).innerText || '').replace(/\n/gm, '');
        });
        const expenses = await page.$$eval('#rc-1-expenses td', ($v) => {
          console.log('$v :', $v);
          // debugger;
          return ((<any>$v?.[1]).innerText || '').replace(/\n/gm, '');
        });
        const performance = await page.$$eval('#rc-1-performance td', ($v) => {
          console.log('$v :', $v);
          // debugger;
          return ((<any>$v?.[1]).innerText || '').replace(/\n/gm, '');
        });
        const volatility = await page.$$eval('#rc-1-volatility td', ($v) => {
          console.log('$v :', $v);
          // debugger;
          return ((<any>$v?.[1]).innerText || '').replace(/\n/gm, '');
        });
        const dividend = await page.$$eval('#rc-1-dividend td', ($v) => {
          console.log('$v :', $v);
          // debugger;
          return ((<any>$v?.[1]).innerText || '').replace(/\n/gm, '');
        });
        const concentration = await page.$$eval('#rc-1-concentration td', ($v) => {
          console.log('$v :', $v);
          // debugger;
          return ((<any>$v?.[1]).innerText || '').replace(/\n/gm, '');
        });

        const ratingResult = {
          key,
          overallRating,
          liquidity,
          expenses,
          performance,
          volatility,
          dividend,
          concentration,
        };
        console.log('ratingResult :', ratingResult);
        ratings.push(ratingResult);
      } catch (error) {
        if (ratingRetryLeft <= 0) {
          console.log('error :', error);
          return false;
        }
        ratingRetryLeft--;
        return ratingRetry();
      }
      return true;
    };
    await ratingRetry();
  }, null);


  await browser.close();
  // console.log('data :', data);
  return { profiles, ratings };
};


// export default async function echo(d : any, err : Error) {
//   const { data } = await getList();
//   console.log('data :', data);
//   if (err) {
//     return Promise.reject(err);
//   }
//   return Promise.resolve(utils(d));
// }
