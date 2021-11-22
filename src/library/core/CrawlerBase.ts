import fs from 'fs';
import path from 'path';
import moment from 'moment';
import { google, drive_v3 } from 'googleapis';
import puppeteer, { launch, Browser } from 'puppeteer';
import useProxy from 'puppeteer-page-proxy';
import readline from 'readline';
import XLSX from 'xlsx';
import { Readable } from 'stream';
import { promiseWait, promiseWaitFor } from '~/utils';
import GoogleOAuth2Client from '~/utils/GoogleOAuth2Client';
import GoogleDriveManager from '~/utils/GoogleDriveManager';

export type PuppeteerLaunchOptions = Parameters<typeof launch>[0];

function bufferToStream(buffer) {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);

  return stream;
}

export default class CrawlerBase {
  goa2c?: GoogleOAuth2Client;

  gdm?: GoogleDriveManager;

  driveApi?: drive_v3.Drive;

  async loadJsonFile(filepath) {
    return new Promise((resolve, reject) => {
      fs.readFile(filepath, (err, content) => {
        if (err) {
          return reject(new Error(`Error loading client secret file: ${err}`));
        }
        try {
          return resolve(JSON.parse(content.toString('utf-8')));
        } catch (e) {
          return reject(e);
        }
      });
    });
  }

  async init() {
    const clientSecrets : any = await this.loadJsonFile(path.join('secrets', 'googleapp_client_secrets.json'));
    this.goa2c = new GoogleOAuth2Client(
      'calendarManager',
      {
        scopes: [
          'https://www.googleapis.com/auth/gmail.modify',
          'https://www.googleapis.com/auth/gmail.compose',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/calendar.events',
          'https://www.googleapis.com/auth/drive.file',
        ],
        clientSecrets: clientSecrets.web,
      }
    );
    try {
      const tokens = await this.loadJsonFile(path.join('secrets', 'googleapp_tokens.json'));
      this.goa2c.authorize(tokens);
    } catch (error) {
      console.log('error :', error);
    }
    this.gdm = new GoogleDriveManager(this.goa2c);
    this.driveApi = google.drive({ version: 'v3', auth: this.goa2c.oAuth2Client });
  }

  getPuppeteerLaunchOptions(debug : boolean = false) : PuppeteerLaunchOptions {
    const args = [
      `--window-size=1920,1080`,
    ];
    const options : PuppeteerLaunchOptions = debug ? {
      devtools: true,
      headless: false,
      slowMo: 250,
      args,
    } : {
      headless: true,
      args,
    };
    if (process.env.IN_DOCKER) {
      return {
        ...options,
        executablePath: '/usr/bin/chromium-browser',
        args: [
          // Required for Docker version of Puppeteer
          '--no-sandbox',
          '--disable-setuid-sandbox',
          // This will write shared memory files into /tmp instead of /dev/shm,
          // because Docker’s default for /dev/shm is 64MB
          '--disable-dev-shm-usage',
  
          '--disable-gpu',
          '--single-process',
          '--disable-web-security',
          '--disable-dev-profile',
          ...(options.args || []),
        ],
      };
    }
    return options;
  }

  async newPage(browser: Browser, url: string = '') {
    const page = await browser.newPage();
    await page.setViewport({
      width: 1920,
      height: 1080,
    });
    if (url) {
      await page.goto(url, {
        waitUntil: 'networkidle2',
      });
    }
    return page;
  }

  getStream(json) {
    const rowsToDownload = json;
    console.log('rowsToDownload :', rowsToDownload);
    const h = [
      '訂單號碼',
      '送貨方式',
      '送貨狀態',
      '收件人',
      '收件人電話號碼',
      '地址 1',
      '城市',
      '地區/州/省份',
      '國家／地區',
      '郵政編號（如適用)',
      '商品名稱',
      '商品原價',
      '商品結帳價',
      '結帳價類型',
      '數量',
      '商品類型',
      '訂單來源',
      '訂單日期',
      '訂單狀態',
      '預購訂單',
      '付款方式',
      '付款狀態',
      '貨幣',
      '付款訂單號碼',
      '付款總金額',
      '已退款金額',
      '訂單小計',
      '運費',
      '附加費',
      '優惠折扣',
      '自訂折扣合計',
      '折抵購物金',
      '點數折現',
      '折現用點數',
      '訂單合計',
      '稅費',
      '完整地址',
      '串接物流貨態',
      '訂單明細上次列印時間',
      '商品成本',
      '預購商品',
      '顧客 ID',
      '顧客',
      '電郵',
      '電話號碼',
      '會員',
      '會員註冊日期',
      '會員註冊來源',
      '兌換贈品點數',
    ];
    const header = h.map(hh => (
      { title: hh, get: (row, i) => row[hh] }
    ));
    // [
    //   { title: '訂單編號', get: (row, i) => i },
    //   { title: '專案代號', get: (row, i) => 'XXX' },
    //   { title: '會員編號', get: (row, i) => 'XXX' },
    // ];
    const transform = (row, i) => header.reduce((m, h) => ({ ...m, [h.title]: h.get(row, i) }), {});
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rowsToDownload.map(transform), { header: header.map(h => h.title) });
    const wscols = header.map(h => ({ wch: 20 }));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, '訂單');
    const resp = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
    return bufferToStream(resp);
  }

  async debugPrint(json) {
    const { data: { files } } = await this.driveApi!.files.list({
      pageSize: 20,
      fields: 'nextPageToken, files(id, name)',
    });
    const folder = files?.find(f => f.name === 'ShoplineReports');
    let folderId = folder?.id;
    if (!folderId) {
      try {
        const fileMetadata = {
          name: 'ShoplineReports',
          mimeType: 'application/vnd.google-apps.folder',
        };
        const res = await this.driveApi!.files.create({
          requestBody: fileMetadata,
          fields: 'id',
        });
        folderId = res.data.id;
      } catch (error) {
      }
    }

    const fileName = 'package.json';
    const fileSize = fs.statSync(fileName).size;
    const fileMetadata = {
      name: `${moment().format('YYYY-MM-DD')}-${new Date().getTime()}.xlsx`,
      originalFilename: fileName,
      parents: [folderId],
      mimeType: 'application/vnd.google-apps.spreadsheet',
    };
    const res = await this.driveApi!.files.create(
      {
        requestBody: fileMetadata,
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Modified
          body: this.getStream(json),
          // body: fs.createReadStream(fileName),
        },
      },
      {
        // Use the `onUploadProgress` event from Axios to track the
        // number of bytes uploaded to this point.
        onUploadProgress: (evt) => {
          const progress = (evt.bytesRead / fileSize) * 100;
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
          process.stdout.write(`${Math.round(progress)}% complete`);
        },
      }
    );
    console.log(res.data);
    return files;
  }

  async run() {
    await this.init();
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(true));
    try {
      const page = await this.newPage(browser);
      await page.goto('https://sso.shoplineapp.com/users/sign_in', {
        waitUntil: 'networkidle2',
      });
      const session = await page.target().createCDPSession();
      await session.send('Page.enable');
      // await page.screenshot({ path: 'example.png' });
      await page.$eval('#staff_email', ($input) => $input.value = 'xtforgame@gmail.com');
      await page.$eval('#staff_password', ($input) => $input.value = 'qqwqqwqqw');
      await page.click('#new_staff button[name=button]');
      await promiseWait(3000);
      await page.goto('https://admin.shoplineapp.com/admin/info1291/orders?createdBy=admin', {
        waitUntil: 'networkidle2',
      });
      await page.click('.btn.btn-primary.ng-binding.dropdown-toggle');
      await page.$$eval('li.export-item a.ng-binding', ($as) => {
        Array.from($as).forEach(($a) => {
          if ($a.innerHTML.includes('匯出訂單報表')) {
            $a.click();
          }
        });
      });
      await promiseWait(3000);
      await page.click('input[name=duringDates]');

      await promiseWait(1000);
      await page.type('input[name=duringDates] ~ div div:nth-child(1) div.date-picker-container.date-picker-v2.date input', '2021/04/12', {
        delay: 200,
      });
      // await page.type('input[name=duringDates] ~ div div:nth-child(2) div.date-picker-container.date-picker-v2.date input', '2021/04/12');
      // await page.$$eval('div.date-picker-container.date-picker-v2.date input', ($inputs) => {
      //   console.log('$inputs :', $inputs);
      //   Array.from($inputs).forEach(($input) => {
      //     $input.value = '2021/04/12';
      //   });
      // });

      const p = new Promise((resolve, reject) => {
        page.on('response', (resp) => {
          const url = resp.url();
          if (url.includes('export_sales')) {
            if (resp.status() === 200) {
              resolve(resp.status());
            } else {
              reject(resp.status());
            }
          }
        });
      });
      await page.click('.modal-footer.clearfix button.btn.btn-primary.ng-binding');
      await p;

      let xlsUrl = '';
      let xlsFilname = '';
      browser.on('targetcreated', async function (target) {
        console.log(target.url());
        const url = target.url();
        if (url.includes('.xls')) {
          xlsUrl = url;
          xlsFilname = /[^\/]*\.xls/g.exec(xlsUrl)?.[0]!;
        }
      });

      await promiseWait(3000);
      await page.goto('https://admin.shoplineapp.com/admin/info1291/jobs', {
        waitUntil: 'networkidle2',
      });
      await page._client.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: __dirname,
      });
      await page.click('table.table.table-hover.ng-scope td div.btn.btn-default.ng-scope');
      const wait = () => {
        if (!xlsFilname) {
          return false;
        }
        try {
          if (fs.existsSync(path.resolve(__dirname, xlsFilname))) {
            const workbook = XLSX.readFile(path.resolve(__dirname, xlsFilname));
            const j = XLSX.utils.sheet_to_json(workbook.Sheets['Sales']);
            console.log('j :', j);
            return true;
          }
        } catch(err) {
          // console.error(err)
        }
        return false;
      }
      let json = {};
      const waitV2 = () => {
        const files = fs.readdirSync(__dirname);
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.includes('orders_') && file.includes('.xls')) {
            const workbook = XLSX.readFile(path.resolve(__dirname, file));
            const j = XLSX.utils.sheet_to_json(workbook.Sheets['Sales']);
            console.log('j :', j);
            json = j;
            return true;
          }
        }
        return false;
      };
      await promiseWaitFor(100, waitV2);
      await this.debugPrint(json);
      console.log('done');
    } catch (error) {
      console.log('error :', error);
    }

    // await promiseWait(9999999);
    await browser.close();
    return 1;
  }
}
