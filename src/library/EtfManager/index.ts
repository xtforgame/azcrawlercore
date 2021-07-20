import mysql from 'mysql';
import { v4 } from 'uuid';
import fs from 'fs';
import { promiseReduce, toMap } from '../utils';


export type ExecFunc = (connection : any) => Promise<any>;

export default class EtfManager {

  async getSymbolList() {
    const symbolList = fs.readdirSync('../apify_storage/key_value_stores/symbols');
    return symbolList.map((s) => {
      const symbol = s.replace(/\.json/g, '');
      const symbolData = fs.readFileSync(`../apify_storage/key_value_stores/symbols/${s}`, { encoding: 'utf-8' });
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
    await this.execInDb(async (c) => {
      const x = await this.sendQuery(c, 'SELECT symbol, symbol_uid from company_info;');
      console.log('x :', x);
    });
  }

  async run() {
    return this.selectAllCompanyInfo();
  }

  update = async () => {
    const symbolList = await this.getSymbolList();
  
    const updateRecords : any[] = [];
    await promiseReduce(symbolList, async (_, s) => {
      const {
        symbol,
        symbolJson,
       } = s;
  
      const profileData = fs.readFileSync(`../apify_storage/key_value_stores/etfDbProfile/${s}`, { encoding: 'utf-8' });
      const profileJson = JSON.parse(profileData);
  
      let scoreJson : any = {};
      try {
        const scoreData = fs.readFileSync(`../apify_storage/key_value_stores/etfDbScore/${s}`, { encoding: 'utf-8' });
        scoreJson = JSON.parse(scoreData);
      } catch (error) {
        
      }
  
      let gurufocusJson : any = {};
      try {
        const gurufocusData = fs.readFileSync(`../apify_storage/key_value_stores/gurufocus/${s}`, { encoding: 'utf-8' });
        gurufocusJson = JSON.parse(gurufocusData);
      } catch (error) {
        
      }
  
      // console.log('gurufocusJson.price :', gurufocusJson.price);
      // console.log('gurufocusJson.bestMultipiler :', gurufocusJson.bestMultipiler);
  
      // console.log('symbolJson :', symbolJson);
      // console.log('profileJson :', profileJson);
      const profile = toMap<any>(profileJson.profile, d => d.key);
      // console.log('profile :', profile);
  
  
      let totalScore = 0;
      let totalWeight = 0;
      const scoreTable = {
        'A+': 10,
        'A': 9,
        'A-': 8,
        'B+': 7,
        'B': 6,
        'B-': 5,
        'C+': 4,
        'C': 3,
        'n/a': 0,
        '': 0,
      };
      const getScore = (s, weight) => {
        if (s && s !== 'n/a') {
          totalWeight += weight
        }
        totalScore += scoreTable[s] * weight;
        return scoreTable[s];
      };
  
      const scores : any = {
        esg: 0,
        overall_rating: getScore(scoreJson.overallRating, 50),
        liquidity: getScore(scoreJson.liquidity, 5),
        expenses: getScore(scoreJson.expenses, 5),
        performance: getScore(scoreJson.performance, 5),
        volatility: getScore(scoreJson.volatility, 5),
        dividend: getScore(scoreJson.dividend, 5),
        concentration: getScore(scoreJson.concentration, 5),
      };
  
      scores.score = totalScore / totalWeight;
      if (!scores.score) {
        scores.score = 0;
      }
      // console.log('scores :', scores);
  
      const result = {
        issuer: profile?.Issuer?.value?.value,
        brand: profile?.Brand?.value?.value,
        structure: profile?.Structure?.value?.value,
        expense_ratio: profile?.['Expense Ratio']?.value?.value,
        home_page: profile?.['ETF Home Page']?.value?.link,
        inception: profile?.Inception?.value?.value,
        index_tracked: profile?.['Index Tracked']?.value?.value === 'ACTIVE - No Index' ? '' : profile?.['Index Tracked']?.value?.value,
        category: profile?.Category?.value?.value,
        asset_class: profile?.['Asset Class']?.value?.value,
        region: profile?.['Region (General)']?.value?.value,
        // description: profile?.['Region (General)']?.value,
        price: symbolJson.Price,
        fair_price: gurufocusJson.bestMultipiler && gurufocusJson.price * gurufocusJson.bestMultipiler,
      };
      // fair_price
      // ACTIVE - No Index
      // console.log('result :', result);
  
      updateRecords.push({
        symbol,
        ...result,
        ...scores,
      });
  
      // const x = await sendQuery(`UPDATE etf_info SET symbol = '${symbol}', issuer = '${}' WHERE symbol_uid = '${symbol}'`)
    }, (<any>null));
  
    // await new Promise((resolve, reject) => {
    //   connection.query('SELECT 1 + 1 AS solution', (error, results, fields) => {
    //     if (error) reject(error);
    //     console.log('The solution is: ', results[0].solution);
    //     resolve(results);
    //   });
    // });
  
    // await new Promise((resolve, reject) => {
    //   connection.query('SELECT * FROM etf_info', (error, results, fields) => {
    //     if (error) reject(error);
    //     console.log('etf_info: ', results[0]);
    //     resolve(results);
    //   });
    // });
  
    // await promiseReduce(symbolList, async (_, s) => {
    //   const symbol = s.replace(/\.json/g, '');
    //   const x = await sendQuery(`INSERT INTO etf_info (symbol_uid) VALUES ('${symbol}')`)
    // }, (<any>null));
  
  
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
  
    await sendQuery(`ALTER TABLE etf_info MODIFY home_page VARCHAR(300);`);
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
      const x = toSetter(r).join(',');
      await sendQuery(`UPDATE etf_info SET ${x} WHERE symbol_uid = '${r.symbol}';`);
    }, (<any>null));
  
    connection.end();
  }
}
