import mysql from 'mysql';

export default () => {
  const connection = mysql.createConnection({
    host: '172.18.0.1',
    user: 'root',
    password: 'mrlp2938!@#',
    database: 'gugu',
  });

  connection.connect();

  connection.query('SELECT 1 + 1 AS solution', (error, results, fields) => {
    if (error) throw error;
    console.log('The solution is: ', results[0].solution);
  });

  connection.end();
};
