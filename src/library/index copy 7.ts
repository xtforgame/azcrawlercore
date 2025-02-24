import fs from 'fs';
import path from 'path';
import csv from 'csv-parser'; // 安裝：`npm install csv-parser`
import { stringify } from 'csv-stringify/sync'; // 安裝：`npm install csv-stringify`

// 檔案路徑
const jsonDirPath = path.join('chat', 'export2', 'member-map');
const membersCsvPath = path.join('chat', 'members.csv');
const outputCsvPath =  path.join('chat', 'members_lost.csv');

// 讀取 JSON 檔案名稱
const getJsonFileIds = (): Set<string> => {
    const files = fs.readdirSync(jsonDirPath);
    return new Set(
        files
            .filter(file => file.endsWith('.json'))
            .map(file => file.replace('.json', ''))
    );
};

// 讀取 CSV 並找出缺少的 JSON 使用者
const findMissingJsonUsers = async () => {
    const jsonFileIds = getJsonFileIds();
    const missingRows: string[][] = []; // 儲存遺失的資料行

    return new Promise<void>((resolve, reject) => {
        fs.createReadStream(membersCsvPath)
            .pipe(csv())
            .on('data', (row) => {
                const memberId = row.member_id?.trim(); // 確保處理空白
                if (memberId && !jsonFileIds.has(memberId)) {
                    missingRows.push(Object.values(row));
                }
            })
            .on('end', () => {
                // 輸出到新的 CSV 檔案
                console.log('missingRows :', missingRows);
                const csvOutput = stringify(missingRows, { header: false });
                fs.writeFileSync(outputCsvPath, csvOutput, 'utf8');
                console.log(`Missing members saved to ${outputCsvPath}`);
                resolve();
            })
            .on('error', (err) => {
                console.error(`Error reading CSV: ${err.message}`);
                reject(err);
            });
    });
};




export default async function echo<T=any>(data : T, err: any = undefined) {
  // 執行
  findMissingJsonUsers().catch(err => {
    console.error('Error:', err);
  });
}
