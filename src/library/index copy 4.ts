import * as fs from 'fs';
import * as path from 'path';

export default async function echo<T=any>(data : T, err: any = undefined) {
  const folderPath = path.join('chat', 'export2', 'member-map');

  // 讀取資料夾中的所有檔案
  fs.readdir(folderPath, (err, files) => {
    if (err) {
      console.error('無法讀取資料夾', err);
      return;
    }

    // 過濾出.json檔案
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    jsonFiles.forEach(file => {
      const filePath = path.join(folderPath, file);

      // 讀取每個.json檔案
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          console.error(`無法讀取檔案: ${file}`, err);
          return;
        }

        try {
          // 將檔案內容轉換為物件
          const jsonObject = JSON.parse(data);

          // 檢查 object.messages 是否是一個 array
          if (!Array.isArray(jsonObject.messages)) {
            // 如果不是 array，檢查 messages 的值是否是一個 array
            const nestedMessages = jsonObject.messages?.messages;
            if (nestedMessages && Array.isArray(nestedMessages)) {
              // 消除多餘的一層，使 object.messages 直接是 array
              jsonObject.messages = nestedMessages;
            } else {
              console.warn(`檔案 ${file} 中的 messages 結構異常`);
              return;
            }
          }

          // 以 JSON.stringify(object, null, 2) 覆蓋原檔案
          fs.writeFile(filePath, JSON.stringify(jsonObject, null, 2), 'utf8', (err) => {
            if (err) {
              console.error(`無法覆蓋檔案: ${file}`, err);
            } else {
              console.log(`檔案已更新: ${file}`);
            }
          });
        } catch (err) {
          console.error(`檔案 ${file} 解析失敗`, err);
        }
      });
    });
  });

}
