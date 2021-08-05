import mysql from 'mysql';
import axios from 'axios';
import moment from 'moment';
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
    // return this.crawler.fetch();
    // return this.translate();
    const companyInfos = await this.selectAllCompanyInfo();
    const companyMap = toMap(companyInfos, info => info.symbol);

    return this.update(companyMap);
  }

  async update(companyMap) {
    const connection = mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'mrlp2938!@#',
      database: 'gugu',
    });
  
    connection.connect();
  
    const sendQuery = (q) => new Promise<any>((resolve, reject) => {
      connection.query(q, (error, results, fields) => {
        if (error) return reject(error);
        resolve({
          results, fields,
        });
      });
    });


    const newTags = [
      {
        id: 14,
        tag: '股債64',
        stocks: [],
      },
      {
        id: 15,
        tag: '全天候',
        stocks: [],
      },
      {
        id: 16,
        tag: '成長股',
        stocks: [],
      },
      {
        id: 17,
        tag: '飆股',
        stocks: [
          'VTNR',
          'SGOC',
          'NURO',
          'MRIN',
          'AMC',
          'AEMD',
          'AMEH',
          'ACY',
          'STFC',
          'BYSI',
          'MRNA',
          'AEHR',
          'ALF',
          'BNTX',
          'ASAN',
          'BTU',
          'IKNX',
          'EAST',
          'PRTA',
          'JILL',
        ],
      },
    ];

    await promiseReduce(newTags, async (_, r) => {
      const { id, tag } = r;
      const existsRows : any = await sendQuery(`SELECT name FROM tags WHERE name = '${tag}';`);
      if (!existsRows.results.length) {
        try {
          await sendQuery(`INSERT INTO tags (id, name, enabled) VALUES (${id}, '${tag}', true);`);
        } catch (error) {
          console.log('error :', error);
          // await sendQuery(`DELETE FROM news WHERE news_uid='${row.news_uid}';`);
          // await sendQuery(`DELETE FROM company_news WHERE news_uid='${row.news_uid}';`);
        }
      } else {
        try {
          await sendQuery(`UPDATE tags SET is_growth = false WHERE name = '${tag}';`);
        } catch (error) {
          console.log('error :', error);
          // await sendQuery(`DELETE FROM news WHERE news_uid='${row.news_uid}';`);
          // await sendQuery(`DELETE FROM company_news WHERE news_uid='${row.news_uid}';`);
        }
      }
      // await sendQuery(`UPDATE news SET ${x} WHERE symbol = '${r.symbol}';`);
    }, (<any>null));

    console.log('newTags :', newTags);

    // const existsRows = await sendQuery(`SELECT * FROM tags;`);
    // console.log('existsRows.results :', existsRows.results);
    
    // const existsRows2 = await sendQuery(`SELECT symbol_uid, tag_id FROM company_tag;`);
    // console.log('existsRows2 :', existsRows);
    connection.end();
  }
}
