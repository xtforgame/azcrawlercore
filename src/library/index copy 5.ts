import * as fs from 'fs';
import * as path from 'path';

export default async function echo<T=any>(data : T, err: any = undefined) {
  const folderPathExport2 = path.join('chat', 'export2', 'member-map');
  const folderPathExport = path.join('chat', 'export', 'member-map');

  // 讀取所有檔案中的 messages 並返回一個集合
  const loadMessagesFromFolder = (folderPath: string): Set<number> => {
    const messageIds = new Set<number>();

    const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.json'));
    files.forEach(file => {
      const filePath = path.join(folderPath, file);
      const data = fs.readFileSync(filePath, 'utf8');
      
      try {
        const jsonObject = JSON.parse(data);
        if (Array.isArray(jsonObject.messages)) {
          jsonObject.messages.forEach((message: { id: number }) => {
            messageIds.add(message.id);
          });
        }
      } catch (err) {
        console.error(`無法解析檔案: ${file}`, err);
      }
    });

    return messageIds;
  };

  // 從 export 資料夾中讀取所有 message 的 id
  const existingMessageIds = loadMessagesFromFolder(folderPathExport);

  // 處理 export2 資料夾中的檔案，排除已存在的 message
  const processFiles = () => {
    const files = fs.readdirSync(folderPathExport2).filter(file => file.endsWith('.json'));

    files.forEach(file => {
      const filePath = path.join(folderPathExport2, file);
      const data = fs.readFileSync(filePath, 'utf8');

      try {
        // 將檔案內容轉換為物件
        const jsonObject = JSON.parse(data);

        if (!Array.isArray(jsonObject.messages)) {
          console.warn(`檔案 ${file} 中的 messages 不是一個 array`);
          return;
        }

        // 過濾出 id 不在 existingMessageIds 的 messages
        const filteredMessages = jsonObject.messages.filter((message: { id: number }) => {
          return !existingMessageIds.has(message.id);
        });

        // 更新檔案，保留沒有重複的 messages
        if (filteredMessages.length !== jsonObject.messages.length) {
          jsonObject.messages = filteredMessages;
          fs.writeFileSync(filePath, JSON.stringify(jsonObject, null, 2), 'utf8');
          console.log(`檔案已更新，移除 ${jsonObject.messages.length - filteredMessages.length} 則重複訊息: ${file}`);
        } else {
          console.log(`檔案 ${file} 沒有重複訊息`);
        }

      } catch (err) {
        console.error(`檔案 ${file} 解析失敗`, err);
      }
    });
  };

  // 開始處理 export2 資料夾
  processFiles();


}
