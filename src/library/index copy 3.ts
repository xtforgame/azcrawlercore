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
  const { data } = await axios({
    url: 'https://etfdb.com/data_set/?tm=87787&cond={%22by_type%22:[%22Etfdb::EtfType%22,1930,null,false,false]}&no_null_sort=true&count_by_id=&limit=25&sort=symbol&order=asc&limit=25&offset=0',
  });
  console.log('data.total :', data.total);
  console.log('data.rows.length :', data.rows.length);
  // const searchUrl = 'https://etfdb.com/data_set/?tm=87787&cond={%22by_type%22:[%22Etfdb::EtfType%22,1930,null,false,false]}&no_null_sort=true&count_by_id=&limit=600&sort=symbol&order=asc&limit=600&offset=0';
  // https://etfdb.com/data_set/?tm=87787&cond={%22by_type%22:[%22Etfdb::EtfType%22,1930,null,false,false]}&no_null_sort=true&count_by_id=&limit=25&sort=symbol&order=asc&limit=25&offset=25
};


export default async function echo(d : any, err : Error) {
  await getList();
  if (err) {
    return Promise.reject(err);
  }
  return Promise.resolve(utils(d));
}