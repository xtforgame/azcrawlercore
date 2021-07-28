import mysql from 'mysql';
import { v4 } from 'uuid';
import fs from 'fs';
import moment from 'moment';
import { promiseReduce, toMap } from '../utils';
import { translate } from '../core/translate';
import Crawler from './Crawler';


export type ExecFunc = (connection : any) => Promise<any>;

export default class EtfManager {
  crawler: Crawler;

  constructor () {
    this.crawler = new Crawler();
  }

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

  async run() {
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

  update = async (companyMap) => {
    const symbolList = await this.getSymbolList();
  
    const updateRecords : any[] = [];
    const tMaps : { [s: string] : {[s: string]: string} } = {
      "category": {
          "Precious Metals": "貴金屬",
          "Global Equities": "環球股票",
          "Asia Pacific Equities": "亞太股票",
          "All Cap Equities": "所有上限股票",
          "Alternative Energy Equities": "替代能源股票",
          "Diversified Portfolio": "多元化投資組合",
          "Large Cap Blend Equities": "大盤混合股票",
          "Large Cap Growth Equities": "大型成長股",
          "Foreign Large Cap Equities": "外國大盤股",
          "Hedge Fund": "對沖基金",
          "Total Bond Market": "總債券市場",
          "China Equities": "中國股票",
          "n/a": "n/a",
          "Leveraged Commodities": "槓桿商品",
          "Leveraged Bonds": "槓桿債券",
          "Building & Construction": "建築與施工",
          "Small Cap Blend Equities": "小盤混合股票",
          "MLPs": "MLPs",
          "High Yield Bonds": "高收益債券",
          "Latin America Equities": "拉丁美洲股票",
          "Health & Biotech Equities": "健康與生物科技股票",
          "Industrials Equities": "工業股票",
          "Foreign Small & Mid Cap Equities": "外國中小盤股",
          "Small Cap Value Equities": "小盤價值股票",
          "National Munis": "國家政府債券",
          "Agricultural Commodities": "農產品",
          "Volatility Hedged Equity": "波動性對沖股票",
          "Commodity Producers Equities": "商品生產者股票",
          "Europe Equities": "歐洲股票",
          "Japan Equities": "日本股票",
          "Small Cap Growth Equities": "小型成長股",
          "Real Estate": "房地產",
          "Commodities": "商品",
          "Financials Equities": "金融股票",
          "Consumer Discretionary Equities": "非必需消費品股票",
          "Leveraged Equities": "槓桿股票",
          "Emerging Markets Equities": "新興市場股票",
          "Government Bonds": "政府債券",
          "Technology Equities": "科技股",
          "Oil & Gas": "石油和天然氣",
          "Emerging Markets Bonds": "新興市場債券",
          "Corporate Bonds": "公司債券",
          "Long-Short": "長短",
          "International Government Bonds": "國際政府債券",
          "Large Cap Value Equities": "大市值股票",
          "Currency": "貨幣",
          "Water Equities": "水務股票",
          "Inverse Equities": "反向股票",
          "Global Real Estate": "環球房地產",
          "Mortgage Backed Securities": "抵押貸款支持證券",
          "California Munis": "加州政府債券",
          "Materials": "材料",
          "Metals": "金屬",
          "Energy Equities": "能源股票",
          "Leveraged Currency": "槓桿貨幣",
          "Preferred Stock/Convertible Bonds": "優先股/可轉換債券",
          "Mid Cap Blend Equities": "中盤混合股票",
          "Inverse Commodities": "反向商品",
          "Leveraged Real Estate": "槓桿房地產",
          "Utilities Equities": "公用事業股票",
          "Communications Equities": "通訊股票",
          "Mid Cap Growth Equities": "中型成長股",
          "Consumer Staples Equities": "主要消費品股票",
          "Inflation-Protected Bonds": "通脹保值債券",
          "Target Retirement Date": "目標退休日期",
          "Mid Cap Value Equities": "中盤價值股票",
          "Transportation Equities": "運輸股票",
          "Money Market": "貨幣市場",
          "New York Munis": "紐約政府債券",
          "Leveraged Multi-Asset": "槓桿多資產",
          "Inverse Bonds": "反向債券",
          "Volatility": "波動性",
          "Leveraged Volatility": "槓桿波動"
      },
      "asset_class": {
          "Commodity": "商品",
          "Equity": "股票",
          "Multi-Asset": "多資產",
          "Bond": "債券",
          "Real Estate": "房地產",
          "Volatility": "波動性",
          "Alternatives": "備擇方案",
          "Currency": "貨幣",
          "Preferred Stock": "優先股"
      }
    };
    const tFunc = async (type: string, s: string) => {
      let subMap = tMaps[type] || (tMaps[type] = {});
      let result : string | null | undefined = subMap[s];
      if (result != null) {
        return result;
      }
      result = await translate(s, 'text', subMap);
      if (result) {
        subMap[s] = result;
      }
      return result;
    }
    await promiseReduce(symbolList, async (_, s) => {
      const {
        symbol,
        symbolJson,
       } = s;
  
      let profileJson : any = {};
      try {
        const profileData = fs.readFileSync(`../apify_storage/key_value_stores/etfDbProfile/${symbol}.json`, { encoding: 'utf-8' });
        profileJson = JSON.parse(profileData);
      } catch (error) {
        return;
      }

      let scoreJson : any = {};
      try {
        const scoreData = fs.readFileSync(`../apify_storage/key_value_stores/etfDbScore/${symbol}.json`, { encoding: 'utf-8' });
        scoreJson = JSON.parse(scoreData);
      } catch (error) {
        
      }
  
      let gurufocusJson : any = {};
      try {
        const gurufocusData = fs.readFileSync(`../apify_storage/key_value_stores/gurufocus/${symbol}.json`, { encoding: 'utf-8' });
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
      scores.score *= 10;
      // console.log('scores :', scores);

      const getAvg = (key) => {
        const array = (gurufocusJson.series || []).map(v => parseFloat(v[key]) || 0).filter(i => i);
        const sum = array.reduce((a, b) => a + b, 0);
        const avg = (sum / array.length) || 0;
        const last = array[array.length - 1] || 0;
        const multiplier = last / avg;
        return {
          sum,
          avg,
          last,
          multiplier,
        };
      };

      const yield1 = getAvg('yield');
      const bestMultipiler = Math.max(gurufocusJson.bestMultipiler, yield1.multiplier);
  
      const inception = profile?.Inception?.value?.value;
      const result = {
        issuer: profile?.Issuer?.value?.value,
        brand: profile?.Brand?.value?.value,
        structure: profile?.Structure?.value?.value,
        expense_ratio: profile?.['Expense Ratio']?.value?.value,
        home_page: profile?.['ETF Home Page']?.value?.link,
        inception: inception && moment(inception).format('YYYY/MM/DD'),
        index_tracked: profile?.['Index Tracked']?.value?.value === 'ACTIVE - No Index' ? '' : profile?.['Index Tracked']?.value?.value,
        category: await tFunc('category', profile?.Category?.value?.value),
        asset_class: await tFunc('asset_class', profile?.['Asset Class']?.value?.value),
        region: profile?.['Region (General)']?.value?.value,
        exchange: symbolJson.exchange.name,
        // description: profile?.['Region (General)']?.value,
        price: symbolJson.Price,
        fair_price: (bestMultipiler && gurufocusJson.price * bestMultipiler) || 0,
      };
      // fair_price
      // ACTIVE - No Index
      // console.log('result :', result);

      const x = {
        symbol,
        ...result,
        ...scores,
      };

      console.log('x :', x);
  
      updateRecords.push(x);
  
      // const x = await sendQuery(`UPDATE etf_info SET symbol = '${symbol}', issuer = '${}' WHERE symbol_uid = '${symbol}'`)
    }, (<any>null));

    // fs.writeFileSync(`tMaps.json`, JSON.stringify(tMaps), { encoding: 'utf-8' });
  
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

    // return ;

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

    await sendQuery(`TRUNCATE TABLE etf_fair_price;`);
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
      if (!companyMap[r.symbol]) {
        return;
      }
      r.symbol_uid = companyMap[r.symbol].symbol_uid;
      const x = toSetter(r).join(',');
      await sendQuery(`UPDATE etf_info SET ${x} WHERE symbol = '${r.symbol}';`);


      let gurufocusJson : any = {};
      try {
        const gurufocusData = fs.readFileSync(`../apify_storage/key_value_stores/gurufocus/${r.symbol}.json`, { encoding: 'utf-8' });
        gurufocusJson = JSON.parse(gurufocusData);
      } catch (error) {
        
      }

      const getAvg = (key) => {
        const array = (gurufocusJson.series || []).map(v => parseFloat(v[key]) || 0).filter(i => i);
        const sum = array.reduce((a, b) => a + b, 0);
        const avg = (sum / array.length) || 0;
        const last = array[array.length - 1] || 0;
        const multiplier = last / avg;
        return {
          sum,
          avg,
          last,
          multiplier,
        };
      }; 

      let bestMultipiler = gurufocusJson.bestMultipiler;

      const yield1 = getAvg('yield');

      // bestMultipiler = Math.max(gurufocusJson.bestMultipiler, yield1.multiplier);


      const date = moment();
      const fairPriceData = {
        symbol_uid: r.symbol_uid,
        date: date.isValid() ? date.format('YYYY-MM-DD') : null,
        fair_price: (bestMultipiler && gurufocusJson.price * bestMultipiler) || null,
        estimate_pe: (gurufocusJson.pe?.multiplier && gurufocusJson.price * gurufocusJson.pe?.multiplier) || null,
        estimate_pb: (gurufocusJson.pb?.multiplier && gurufocusJson.price * gurufocusJson.pb?.multiplier) || null,
        estimate_dividend: (yield1?.multiplier && gurufocusJson.price * yield1?.multiplier) || null,
      };
      const fairPriceDataS = toSetter(fairPriceData).join(',');
      const existsRows = await sendQuery(`SELECT symbol_uid FROM etf_fair_price WHERE symbol_uid = '${r.symbol_uid}';`);
      if (existsRows.results.length) {
        await sendQuery(`UPDATE etf_fair_price SET ${fairPriceDataS} WHERE symbol_uid = '${r.symbol_uid}';`);
      } else {
        try {
          await sendQuery(`INSERT INTO etf_fair_price (symbol_uid) VALUES ('${r.symbol_uid}');`);
          await sendQuery(`UPDATE etf_fair_price SET ${fairPriceDataS} WHERE symbol_uid = '${r.symbol_uid}';`);
        } catch (error) {
          console.log('error :', error);
          await sendQuery(`DELETE FROM etf_fair_price WHERE symbol_uid = '${r.symbol_uid}';`);
        }
      }
    }, (<any>null));

    const existsRows2 = await sendQuery(`SELECT * FROM etf_fair_price;`);
    console.log('existsRows.results :', existsRows2.results);

    // const xx : any = await sendQuery(`SELECT * FROM etf_info;`);
    // console.log('xx.results :', xx.results);
    connection.end();
  }
}
