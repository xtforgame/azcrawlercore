import mysql from 'mysql';
import axios from 'axios';
import { v4 } from 'uuid';
import fs from 'fs';
import { promiseReduce, toMap, promiseWait } from '../utils';
import Crawler from './Crawler';


export type ExecFunc = (connection : any) => Promise<any>;

export default class StockNewsManager {
  crawler: Crawler;

  constructor () {
    this.crawler = new Crawler();
  }

  async getSymbolList() {
    const symbolList = fs.readdirSync('../apify_storage_z/key_value_stores/symbols');
    return symbolList.map((s) => {
      const symbol = s.replace(/\.json/g, '');
      const symbolData = fs.readFileSync(`../apify_storage_z/key_value_stores/symbols/${s}`, { encoding: 'utf-8' });
      const symbolJson = JSON.parse(symbolData);
      return {
        symbol,
        symbolJson,
      }
    });
  }

  async execInDb(run : ExecFunc) {
    const connection = mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'mrlp2938!@#',
      database: 'gugu',
    });
    connection.connect();

    try {
      await run(connection);
    } catch (error) {
      
    }
    connection.end();
  }

  sendQuery = async (connection, q) => new Promise((resolve, reject) => {
    connection.query(q, (error, results, fields) => {
      if (error) return reject(error);
      resolve({
        results, fields,
      });
    });
  });

  async selectAllCompanyInfo() {
    let results : any[] = [];
    await this.execInDb(async (c) => {
      const x : any = await this.sendQuery(c, 'SELECT * from company_info;');
      results = x.results;
    });
    return results;
  }

  async selectAllEtfInfo() {
    let results : any[] = [];
    await this.execInDb(async (c) => {
      const x : any = await this.sendQuery(c, 'SELECT * from etf_info;');
      results = x.results;
    });
    return results;
  }

  async run2() {
    return this.translate();
    // return this.crawler.fetch();
    const companyInfos = await this.selectAllCompanyInfo();
    const companyMap = toMap(companyInfos, info => info.symbol);
    // console.log('companyMap :', companyMap);
    const etfInfos = await this.selectAllEtfInfo();

    await this.execInDb(async (c) => {
      await promiseReduce(etfInfos, async (_, i) => {
        if (!companyMap[i.symbol]) {
          console.log('i.symbol :', i.symbol);
        }
        // const x : any = await this.sendQuery(c, 'SELECT * from etf_info;');
      }, (<any>null));
    });

    return this.update(companyMap);
  }

  async translate() {
    let symbolList = await this.getSymbolList();
  
    const updateRecords : any[] = [];
    // symbolList = symbolList.slice(4, 9);
    await promiseReduce(symbolList, async (_, s) => {
      const {
        symbol,
        symbolJson,
      } = s;

      console.log('symbol :', symbol);

      let newsJson : any = {};
      try {
        const newsData = fs.readFileSync(`../apify_storage_z/key_value_stores/news/${symbol}.json`, { encoding: 'utf-8' });
        newsJson = JSON.parse(newsData);
      } catch (error) {
        return;
      }
      let newsListJson : any = {};
      try {
        const newsListData = fs.readFileSync(`../apify_storage_z/key_value_stores/results/${symbol}.json`, { encoding: 'utf-8' });
        newsListJson = JSON.parse(newsListData);
      } catch (error) {
        return;
      }
      if (!newsJson.translatedTitle) {
        try {
          const { data } = await axios({
            method: 'post',
            url: 'https://translation.googleapis.com/language/translate/v2?key=AIzaSyAbw3q6GEVeK_uIQN6TPdg1JSayOObZT-s',
            data: {
              q: newsListJson.scrapedData[0].title,
              source: 'en',
              target: 'zh-TW',
              // format: 'html',
              format: 'text',
            },
          });
          // console.log('data :', data?.data?.translations?.[0]?.translatedText);
          newsJson.translatedTitle = data?.data?.translations?.[0]?.translatedText;
          fs.writeFileSync(`../apify_storage_z/key_value_stores/news/${symbol}.json`, JSON.stringify(newsJson), { encoding: 'utf-8' });
          // const x = await sendQuery(`UPDATE etf_info SET symbol = '${symbol}', issuer = '${}' WHERE symbol_uid = '${symbol}'`)
        } catch (error) {
          console.log('error :', error);
          await promiseWait(60000);
        }
        await promiseWait(100);
      }
      if (!newsJson.translatedBody) {
        try {
          const { data } = await axios({
            method: 'post',
            url: 'https://translation.googleapis.com/language/translate/v2?key=AIzaSyAbw3q6GEVeK_uIQN6TPdg1JSayOObZT-s',
            data: {
              q: newsJson.body.replace(/\<div\s*class[^\s]*caas-readmore\s*[^\s]*\<button.*\<\/button\>.*\<\/div\>/g, ''),
              source: 'en',
              target: 'zh-TW',
              format: 'html',
              // format: 'text',
            },
          });
          // console.log('data :', data?.data?.translations?.[0]?.translatedText);
          newsJson.translatedBody = data?.data?.translations?.[0]?.translatedText
          fs.writeFileSync(`../apify_storage_z/key_value_stores/news/${symbol}.json`, JSON.stringify(newsJson), { encoding: 'utf-8' });
          // const x = await sendQuery(`UPDATE etf_info SET symbol = '${symbol}', issuer = '${}' WHERE symbol_uid = '${symbol}'`)
          
        } catch (error) {
          console.log('error :', error);
          await promiseWait(60000);
        }
        await promiseWait(300);
      }
    }, (<any>null));
  }

  async run() {
    // return this.translate();
    const companyInfos = await this.selectAllCompanyInfo();
    const companyMap = toMap(companyInfos, info => info.symbol);

    return this.update(companyMap);
  }

  async update(companyMap) {
    const symbolList = await this.getSymbolList();
  
    const updateRecords : any[] = [];
    await promiseReduce(symbolList, async (_, s) => {
      const {
        symbol,
        symbolJson,
       } = s;
  
      let newsListJson : any = {};
      try {
        const newsListData = fs.readFileSync(`../apify_storage_z/key_value_stores/results/${symbol}.json`, { encoding: 'utf-8' });
        newsListJson = JSON.parse(newsListData);
      } catch (error) {
        return;
      }

      let newsJson : any = {};
      try {
        const newsData = fs.readFileSync(`../apify_storage_z/key_value_stores/news/${symbol}.json`, { encoding: 'utf-8' });
        newsJson = JSON.parse(newsData);
      } catch (error) {
        
      }

      // console.log('gurufocusJson.price :', gurufocusJson.price);
      // console.log('gurufocusJson.bestMultipiler :', gurufocusJson.bestMultipiler);
  
      // console.log('symbolJson :', symbolJson);
      // console.log('profileJson :', profileJson);
      // const news = toMap<any>(newsJson.profile, d => d.key);
      // console.log('profile :', profile);
  
      // const x = await sendQuery(`UPDATE etf_info SET symbol = '${symbol}', issuer = '${}' WHERE symbol_uid = '${symbol}'`)

      updateRecords.push({
        symbol,
        newsListJson,
        newsJson,
      });
    }, (<any>null));

    const connection = mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'mrlp2938!@#',
      database: 'gugu',
    });
  
    connection.connect();
  
    const sendQuery = (q) => new Promise((resolve, reject) => {
      connection.query(q, (error, results, fields) => {
        if (error) return reject(error);
        resolve({
          results, fields,
        });
      });
    });

    await sendQuery(`TRUNCATE TABLE news;`);
    await sendQuery(`TRUNCATE TABLE company_news;`);
    await promiseReduce(updateRecords, async (_, r) => {
      const toSetter = (r) => {
        const keys = Object.keys(r);
        return keys.map((k) => {
          if (r[k] != null) {
            return `${k} = '${`${r[k]}`.replace(/\'/g, '\'\'')}'`;
          }
          return `${k} = NULL`;
        });
      }
      if (!companyMap[r.symbol]) {
        return;
      }
      r.symbol_uid = companyMap[r.symbol].symbol_uid;
      if (!r.newsListJson.scrapedData[0]) {
        return;
      }

      const row = {
        news_uid: v4(),
        thumbnail: r.newsJson.thumbnail,
        source: r.newsListJson.scrapedData[0].link,
        source_name: r.newsListJson.scrapedData[0].src,
        date: r.newsListJson.scrapedData[0].date,
        source_title: r.newsListJson.scrapedData[0].title,
        source_content: r.newsJson.body,
        source_language: 'en',
        zh_title: r.newsJson.translatedTitle,
        zh_content: r.newsJson.translatedBody,
      }
      const x = toSetter(row).join(',');
      console.log('x :', x);
      const existsRows = await sendQuery(`SELECT news_uid FROM news WHERE source = '${row.source}';`);
      if (existsRows.results.length) {
        await sendQuery(`UPDATE news SET ${x} WHERE source = '${row.source}';`);
      } else {
        await sendQuery(`INSERT INTO news (news_uid, source) VALUES ('${row.news_uid}', '${row.source}');`);
        await sendQuery(`UPDATE news SET ${x} WHERE source = '${row.source}';`);
        await sendQuery(`INSERT INTO company_news (news_uid, symbol_uid) VALUES ('${row.news_uid}', '${r.symbol_uid}');`);
      }
      // await sendQuery(`UPDATE news SET ${x} WHERE symbol = '${r.symbol}';`);
    }, (<any>null));
  
    // await promiseReduce(updateRecords, async (_, r) => {
    //   const toSetter = (r) => {
    //     const keys = Object.keys(r);
    //     return keys.map((k) => {
    //       if (r[k] != null) {
    //         return `${k} = '${`${r[k]}`.replace(/\'/g, '\'\'')}'`;
    //       }
    //       return `${k} = NULL`;
    //     });
    //   }
    //   if (!companyMap[r.symbol]) {
    //     return;
    //   }
    //   r.symbol_uid = companyMap[r.symbol].symbol_uid;
    //   const x = toSetter(r).join(',');
    //   await sendQuery(`UPDATE etf_info SET ${x} WHERE symbol = '${r.symbol}';`);
    // }, (<any>null));
    // const xx : any = await sendQuery(`SELECT * FROM etf_info;`);
    // console.log('xx.results :', xx.results);


    connection.end();
  }
}
