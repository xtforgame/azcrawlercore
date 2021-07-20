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

  const list = fs.readdirSync('../apify_storage/key_value_stores/symbols');
  list.forEach((f) => {
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
    connection.query('SELECT * FROM tags', (error, results, fields) => {
      if (error) reject(error);
      console.log('The solution is: ', results[0].solution);
      resolve(results);
    });
  });

  await promiseReduce([], (_, s) => {
    
  }, (<any>null));

  connection.end();
};
