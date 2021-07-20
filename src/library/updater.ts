import mysql from 'mysql';

export default async () => {
  const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mrlp2938!@#',
    database: 'gugu',
  });

  connection.connect();

  await new Promise((resolve, reject) => {
    connection.query('SELECT 1 + 1 AS solution', (error, results, fields) => {
      if (error) reject(error);
      console.log('The solution is: ', results[0].solution);
      resolve(results);
    });
  });

  await new Promise((resolve, reject) => {
    connection.query('SELECT * AS tags', (error, results, fields) => {
      if (error) reject(error);
      console.log('The solution is: ', results[0].solution);
      resolve(results);
    });
  });

  connection.end();
};
