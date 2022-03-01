import fs from 'fs';
import path from 'path';
import moment from 'moment';
import { google, drive_v3 } from 'googleapis';
import puppeteer, { launch, Browser } from 'puppeteer';
import useProxy from 'puppeteer-page-proxy';
import readline from 'readline';
import XLSX from 'xlsx';
import { Readable } from 'stream';
import { promiseReduce, promiseWait, promiseWaitFor } from '~/utils';
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
  driveApis: drive_v3.Drive[];

  constructor() {
    this.driveApis = [];
  }

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

  async createDriveApi(tokenName: string) {
    const clientSecrets : any = await this.loadJsonFile(path.join('secrets', 'googleapp_client_secrets.json'));
    const goa2c = new GoogleOAuth2Client(
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
    const tokens = await this.loadJsonFile(path.join('secrets', tokenName));
    goa2c.authorize(tokens);
    return google.drive({ version: 'v3', auth: goa2c.oAuth2Client });
  }

  async init() {
    this.driveApis = await Promise.all([
      await this.createDriveApi('googleapp_tokens-r.json'),
      await this.createDriveApi('googleapp_tokens-c1.json'),
      await this.createDriveApi('googleapp_tokens-c2.json'),
    ]);
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

  getWb(json) {
    const rowsToDownload0 = json.filter(r => r['付款狀態'] === '已付款');
    console.log('rowsToDownload0 :', rowsToDownload0);
    const rowsToDownloadX: any[] = [];
    rowsToDownload0.forEach((r, i, arr) => {
      if (r['商品貨號'].indexOf('\n') >= 0) {
        const ids = r['商品貨號'].split('\n');
        let totalOriginalPrice = parseInt(r['商品原價']);
        let totalFinalPrice = parseInt(r['商品結帳價']);
        
        const eachOriginalPrice = Math.floor(totalOriginalPrice / ids.length);
        const eachFinalPrice = Math.floor(totalFinalPrice / ids.length);
        
        ids.forEach((id, i) => {
          const originalPrice = i !== ids.length -1 ? eachOriginalPrice : totalOriginalPrice;
          const finalPrice = i !== ids.length -1 ? eachFinalPrice : totalFinalPrice;
          if (i) {
            rowsToDownloadX.push({
              ...r,
              '商品貨號': id,
              '商品原價': originalPrice,
              '商品結帳價': finalPrice,
              '付款總金額': '',
              '訂單小計': '',
              '訂單合計': '',
              '運費': '',
              '附加費': '',
              '優惠折扣': '',
              '自訂折扣合計': '',
              '折抵購物金': '',
              '兌換贈品點數': '',
            });
          } else {
            rowsToDownloadX.push({
              ...r,
              '商品貨號': id,
              '商品原價': originalPrice,
              '商品結帳價': finalPrice,
            });
          }
          totalOriginalPrice -= originalPrice;
          totalFinalPrice -= finalPrice;
        });
      } else {
        rowsToDownloadX.push(r);
      }
    });

    const rowsToDownload: any[] = [];
    let pendingRow = null;
    let discountBaseRow = null;
    rowsToDownloadX.forEach((r, i, arr) => {
      if (pendingRow && pendingRow['訂單號碼'] !== r['訂單號碼']) {
        rowsToDownload.push(pendingRow);
        pendingRow = null;
      }
      if (discountBaseRow && discountBaseRow['訂單號碼'] !== r['訂單號碼']) {
        discountBaseRow = null;
      }
      const total = parseInt(r['付款總金額']);
      if (total > 0) {
        discountBaseRow = {
          ...r,
          '總折抵': parseInt(r['優惠折扣']) + parseInt(r['自訂折扣合計']) + parseInt(r['折抵購物金']) + parseInt(r['點數折現']) + parseInt(r['折現用點數']),
        };
        if (discountBaseRow['總折抵'] <= 0) {
          discountBaseRow = null;
        } else {
          let index = i
          let invalidCounter = 0;
          let lastIndex = 0;
          for (; index < arr.length; index++) {
            const element = arr[index];
            if (discountBaseRow!['訂單號碼'] !== element['訂單號碼']) {
              break;
            }
            if (parseInt(element['商品原價']) > 0) {
              lastIndex = index;
            } else {
              invalidCounter++;
            }
          }
          console.log('total :', discountBaseRow['總折抵']);
          const divider = index - i - invalidCounter;
          discountBaseRow.divider = divider;
          discountBaseRow.lastIndex = lastIndex;
          console.log('divider :', divider);
          console.log('lastIndex :', lastIndex);
          discountBaseRow['平均折抵'] = Math.floor(discountBaseRow['總折抵']/divider);
        }
      }
      const shippingFee = parseInt(r['運費']);
      if (shippingFee > 0) {
        pendingRow = {
          ...r,
          '數量': 1,
          '商品名稱': '運費',
          '商品貨號': 'ADD-L',
          '商品原價': shippingFee,
          '商品結帳價': shippingFee,
        };
      }
      if (
        discountBaseRow
        && discountBaseRow['訂單號碼'] === r['訂單號碼']
        && parseInt(r['商品原價']) > 0
      ) {
        if (i !== discountBaseRow.lastIndex) {
          r['商品原價'] = parseInt(r['商品原價']) - (discountBaseRow['平均折抵'] / parseInt(r['數量']));
          r['商品結帳價'] = parseInt(r['商品結帳價']) - (discountBaseRow['平均折抵'] / parseInt(r['數量']));
          discountBaseRow['總折抵'] -= discountBaseRow['平均折抵']
        } else {
          r['商品原價'] = parseInt(r['商品原價']) - (discountBaseRow['總折抵'] / parseInt(r['數量']));
          r['商品結帳價'] = parseInt(r['商品結帳價']) - (discountBaseRow['總折抵'] / parseInt(r['數量']));
          discountBaseRow['總折抵'] = 0;
        }
      }
      rowsToDownload.push(r);
    });
    if (pendingRow) {
      rowsToDownload.push(pendingRow);
      pendingRow = null;
    }
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
    // const header = h.map(hh => (
    //   { title: hh, get: (row, i) => row[hh] }
    // ));

    const header = [
      { title: '客戶代號', get: (row, i) => 'FG0003' },
      { title: '專案代號', get: (row, i) => 'I' },
      { title: '會員編號', get: (row, i) => row['顧客 ID'] },
      { title: '會員姓名', get: (row, i) => row['顧客'] },
      { title: '品號', get: (row, i) => row['商品貨號']  }, // 商品名稱
      { title: '訂單數量', get: (row, i) => row['數量'] },
      { title: '單價', get: (row, i) => row['結帳價類型'] === '原價' ? row['商品原價'] : row['商品結帳價'] },
      { title: '發票號碼', get: (row, i) => row['發票號碼'] },
      { title: '訂單編號', get: (row, i) => (row['訂單號碼'] || '').replace('#', '') },
      { title: '備註', get: (row, i) => row['出貨備註'] },
      { title: '收件人', get: (row, i) => row['收件人'] },
      { title: '聯絡電話(一)', get: (row, i) => row['電話號碼'] },
      { title: '聯絡電話(二)', get: (row, i) => row['收件人電話號碼'] },
      { title: '送貨地址(一)', get: (row, i) => row['完整地址'] }, // `${row['國家／地區']} ${row['地區/州/省份']} ${row['城市']} ${row['郵政編號（如適用)']} ${row['地址 1']}` },
      { title: '送貨地址(二)', get: (row, i) => '' }, // row['地址 2'] },
      { title: '註冊email', get: (row, i) => row['電郵'] },
      { title: '註冊電話', get: (row, i) => row['電話號碼'] },
    ];
    // [
    //   { title: '訂單編號', get: (row, i) => i },
    //   { title: '專案代號', get: (row, i) => 'XXX' },
    //   { title: '會員編號', get: (row, i) => 'XXX' },
    // ];
    // const transform = (row, i) => header.reduce((m, h) => ({ ...m, [h.title]: h.get(row, i) }), {});
    // const transform2 = (h, i) => [h.title, ...rowsToDownload.map((row) => h.get(row, i))];
    // const wb = XLSX.utils.book_new();
    // const ws = XLSX.utils.aoa_to_sheet(header.map(transform2));
    // // const ws = XLSX.utils.json_to_sheet(rowsToDownload.map(transform), { header: header.map(h => h.title) });
    // const wscols = header.map(h => ({ wch: 20 }));
    // ws['!cols'] = wscols;

    const transform = (row, i) => header.reduce((m, h) => ({ ...m, [h.title]: h.get(row, i) }), {});
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rowsToDownload.map(transform), { header: header.map(h => h.title) });
    const wscols = header.map(h => ({ wch: 20 }));
    ws['!cols'] = wscols;

    XLSX.utils.book_append_sheet(wb, ws, '訂單');
    return wb;
  }

  async cleanFolder(driveApi: drive_v3.Drive) {
    const { data: { files } } = await driveApi.files.list({
      pageSize: 1000,
      fields: 'nextPageToken, files(id, name, createdTime)',
      orderBy: 'createdTime'
    });
    const folder = files?.find(f => f.name === 'ShoplineReports');
    if (files) {
      await promiseReduce(files, async (_, f) => {
        if (f.id === folder?.id) {
          return;
        }
        try {
          let res = await driveApi.files.delete({ 'fileId': f.id });
          console.log('res :', res);
        } catch (error) {
          console.log('error :', error);
        }
      }, null)
    }
  }

  async findFolder(driveApi: drive_v3.Drive) {
    const { data: { files } } = await driveApi.files.list({
      pageSize: 1000,
      fields: 'nextPageToken, files(id, name, createdTime)',
      orderBy: 'createdTime'
    });
    console.log('files :', files);
    return files?.find(f => f.name === 'ShoplineReports');
  }

  async debugPrint(driveApi: drive_v3.Drive, stream, date) {
    const folder = await this.findFolder(driveApi);
    let folderId = folder?.id;
    if (!folderId) {
      try {
        const fileMetadata = {
          name: 'ShoplineReports',
          mimeType: 'application/vnd.google-apps.folder',
        };
        const res = await driveApi.files.create({
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
      name: `${date.format('YYYY-MM-DD')}.xlsx`,
      originalFilename: fileName,
      parents: [folderId],
      // mimeType: 'application/vnd.google-apps.spreadsheet',
    };
    const res = await driveApi.files.create(
      {
        requestBody: fileMetadata,
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Modified
          body: stream,
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
    // return files;
  }

  async runX(date) {
    // await promiseReduce(this.driveApis, async (_, driveApi) => {
    //   await this.findFolder(driveApi);
    // }, null)
    // return ;
    const browser = await puppeteer.launch(this.getPuppeteerLaunchOptions(false));
    try {
      if (1 == 1) {
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
        await page.goto('https://admin.shoplineapp.com/admin/addictionbeauty/orders?createdBy=admin', {
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
        await page.type('input[name=duringDates] ~ div div:nth-child(1) div.date-picker-container.date-picker-v2.date input', date.format('YYYY/MM/DD'), {
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

        await promiseWait(10000);
        await page.goto('https://admin.shoplineapp.com/admin/addictionbeauty/jobs', {
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
      }
      let json = {};
      let filename = '';
      const waitV2 = () => {
        const files = fs.readdirSync(__dirname);
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (file.includes('orders_') && file.includes('.xls') && !file.includes('.crdownload')) {
            const workbook = XLSX.readFile(path.resolve(__dirname, file));
            const j = XLSX.utils.sheet_to_json(workbook.Sheets['Sales']);
            console.log('j :', j);
            json = j;
            filename = file;
            return true;
          }
        }
        return false;
      };
      await promiseWaitFor(100, waitV2);
      const wb = this.getWb(json);
      await promiseReduce(this.driveApis, async (_, driveApi) => {
        const resp = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        const stream = bufferToStream(resp);
        await this.debugPrint(driveApi, stream, date);
      }, null);
      const resp = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
      fs.writeFileSync('xxx.xlsx', resp);
      console.log('path.resolve(__dirname, filename) :', path.resolve(__dirname, filename));
      fs.unlinkSync(path.resolve(__dirname, filename))
      console.log('done');
    } catch (error) {
      console.log('error :', error);
    }

    // await promiseWait(9999999);
    await browser.close();
  }

  async run() {
    await this.init();
    // await promiseReduce(this.driveApis, async (_, driveApi) => {
    //   await this.cleanFolder(driveApi);
    // }, null)
    await promiseReduce([
      // moment('2021-12-02'),
      // moment('2021-12-03'),
      // moment('2021-12-04'),
      // moment('2021-12-05'),
      // moment('2021-12-06'),
      // moment('2021-12-07'),
      // moment('2021-12-08'),
      // moment('2021-12-09'),
      // moment('2021-12-10'),
      // moment('2021-12-11'),
      // moment('2021-12-12'),
      // moment('2021-12-13'),
      // moment('2021-12-14'),
      // moment('2021-12-15'),
      // moment('2021-12-16'),
      // moment('2021-12-17'),
      // moment('2021-12-18'),
      // moment('2021-12-19'),
      // moment('2021-12-20'),
      // moment('2021-12-21'),
      // moment('2021-12-22'),
      // moment('2021-12-23'),
      // moment('2021-12-24'),
      // moment('2021-12-25'),
      // moment('2021-12-26'),
      // moment('2021-12-27'),
      // moment('2021-12-28'),
      // moment('2021-12-29'),
      // moment('2021-12-30'),
      // moment('2021-12-31'),
      // moment('2022-01-01'),
      // moment('2022-01-02'),
      // moment('2022-01-03'),
      // moment('2022-01-04'),
      // moment('2022-01-05'),
      // moment('2022-01-06'),
      // moment('2022-01-07'),
      // moment('2022-01-08'),
      // moment('2022-01-09'),
      // moment('2022-01-10'),
      // moment('2022-01-11'),
      // moment('2022-01-12'),
      // moment('2022-01-13'),
      // moment('2022-01-14'),
      // moment('2022-01-15'),
      // moment('2022-01-16'),
      // moment('2022-01-17'),
      // moment('2022-01-18'),
      // moment('2022-01-19'),
      // moment('2022-01-20'),
      // moment('2022-01-21'),
      // moment('2022-01-22'),
      // moment('2022-01-23'),
      // moment('2022-01-24'),
      // moment('2022-01-25'),
      // moment('2022-01-26'),
      // moment('2022-01-27'),
      // moment('2022-01-28'),
      // moment('2022-01-29'),
      // moment('2022-01-30'),
      // moment('2022-01-31'),
      // moment('2022-02-01'),
      // moment('2022-02-02'),
      // moment('2022-02-03'),
      // moment('2022-02-04'),
      // moment('2022-02-05'),
      // moment('2022-02-06'),
      // moment('2022-02-07'),
      // moment('2022-02-08'),
      // moment('2022-02-09'),
      // moment('2022-02-10'),
      // moment('2022-02-11'),
      // moment('2022-02-12'),
      // moment('2022-02-13'),
      // moment('2022-02-14'),
      // moment('2022-02-15'),
      // moment('2022-02-16'),
      // moment('2022-02-17'),
      // moment('2022-02-18'),
      // moment('2022-02-19'),
      // moment('2022-02-20'),
      // moment('2022-02-21'),
      // moment('2022-02-22'),
      // moment('2022-02-23'),
      // moment('2022-02-24'),
      // moment('2022-02-25'),
      // moment('2022-02-26'),
      // moment('2022-02-27'),
      // moment('2022-02-28'),
      moment('2022-03-01'),
    ], async (_, date) => {
      await this.runX(date);
    }, null)
    return 1;
  }
}
