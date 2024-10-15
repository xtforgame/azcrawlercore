import * as fs from 'fs';
import * as path from 'path';

const folderPath = path.join('chat', 'export2', 'member-map');
const timeDifferenceThreshold = 1000; // 時間相近的閾值，10秒內視為相近

interface Message {
  id: number;
  uuid: string | null;
  text: string;
  created_at: string;
}

export default async function echo<T=any>(data : T, err: any = undefined) {
  const folderPathExport2 = path.join('chat', 'export2', 'member-map');
  const folderPathExport = path.join('chat', 'export', 'member-map');

  // 比較兩個檔案，將 export2 中已存在於 export 的 message.id 移除
  const compareAndFilterMessages = (fileExport2: string, fileExport: string) => {
    const dataExport2 = fs.readFileSync(fileExport2, 'utf8');
    const dataExport = fs.readFileSync(fileExport, 'utf8');

    try {
      const jsonExport2 = JSON.parse(dataExport2);
      const jsonExport = JSON.parse(dataExport);

      // const m2 =jsonExport2.messages.find(m => m.id === 85298743);
      // const m =jsonExport.messages.find(m => m.id === 85298743);
      // console.log('m2, m :', m2, m);

      if (!Array.isArray(jsonExport2.messages) || !Array.isArray(jsonExport.messages)) {
        console.warn(`檔案格式錯誤: ${fileExport2} 或 ${fileExport} 中的 messages 不是一個 array`);
        return;
      }
      

      const existingMessageIds = new Set<number>(jsonExport.messages.map((message: { id: number }) => message.id));

      // 過濾出 export2 中不在 export 檔案中的訊息
      const filteredMessages = jsonExport2.messages.filter((message: { id: number }) => {
        return !existingMessageIds.has(message.id);
      });

      // 更新 export2 檔案，保留沒有重複的 messages
      if (filteredMessages.length !== jsonExport2.messages.length) {
        console.log(`檔案已更新，移除 ${jsonExport2.messages.length - filteredMessages.length} 則重複訊息: ${path.basename(fileExport2)}`);
        jsonExport2.messages = filteredMessages;
        fs.writeFileSync(fileExport2, JSON.stringify(jsonExport2, null, 2), 'utf8');
      } else {
        // console.log(`檔案 ${path.basename(fileExport2)} 沒有重複訊息`);
      }

    } catch (err) {
      console.error(`無法解析檔案: ${fileExport2} 或 ${fileExport}`, err);
    }
  };

  // 處理 export2 資料夾中的檔案
  const processFiles = () => {
    const filesExport2 = fs.readdirSync(folderPathExport2).filter(file => file.endsWith('.json'));

    filesExport2.forEach(file => {
      const fileExport2 = path.join(folderPathExport2, file);
      const fileExport = path.join(folderPathExport, file);

      // 確保 export2 檔案在 export 資料夾中有對應的檔案
      if (fs.existsSync(fileExport)) {
        compareAndFilterMessages(fileExport2, fileExport);
      } else {
        // console.log(`檔案 ${file} 在 export 資料夾中不存在，跳過比對`);
      }
    });
  };

  // 開始處理檔案
  processFiles();

}
