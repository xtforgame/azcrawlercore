import mysql from 'mysql';
import fs from 'fs';
import { promiseReduce } from './utils';

export default async () => {
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

  const symbolList = fs.readdirSync('../apify_storage/key_value_stores/symbols');
  symbolList.forEach((f) => {
    console.log('f :', f);
  });

  await new Promise((resolve, reject) => {
    connection.query('SELECT 1 + 1 AS solution', (error, results, fields) => {
      if (error) reject(error);
      console.log('The solution is: ', results[0].solution);
      resolve(results);
    });
  });

  await new Promise((resolve, reject) => {
    connection.query('SELECT * FROM etf_info', (error, results, fields) => {
      if (error) reject(error);
      console.log('etf_info: ', results[0]);
      resolve(results);
    });
  });

  // await promiseReduce(symbolList, async (_, s) => {
  //   const symbol = s.replace(/\.json/g, '');
  //   const x = await sendQuery(`INSERT INTO etf_info (symbol_uid) VALUES ('${symbol}')`)
  // }, (<any>null));

  await promiseReduce(symbolList, async (_, s) => {
    const symbol = s.replace(/\.json/g, '');
    const data = fs.readFileSync(`../apify_storage/key_value_stores/symbols/${s}`, { encoding: 'utf-8' });
    const symbolJson = JSON.parse(data);
    console.log('symbolJson :', symbolJson);
    // const x = await sendQuery(`UPDATE etf_info SET  WHERE symbol_uid = '${symbol}'`)
  }, (<any>null));

  connection.end();
};
